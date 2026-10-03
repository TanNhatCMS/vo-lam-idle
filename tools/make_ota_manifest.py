#!/usr/bin/env python3
"""Sinh OTA ZIP (media) + assets-manifest.json cho app Android (OtaManager.kt).

Manifest v3 gom 2 phần:
  - media: ZIP đính kèm GitHub Release (img, snd, music, fx) — zipSha256 làm version
  - code:  index.html, *.js, style.css, manifest.json, js/, fonts/, ui/ — từng file
           tải riêng qua raw.githubusercontent (delta per-file), code.version là
           sha256 tổng của danh sách file

Quy trình phát hành:
  1. Copy file game mới vào game/
  2. python tools/make_ota_manifest.py --version 1.3.0
  3. git add assets-manifest.json && git commit && git push
  4. gh release create v1.3.0 app-release.apk ota-assets-1.3.0.zip
ZIP tạo với timestamp cố định nên deterministic: bộ media không đổi -> zipSha256
không đổi -> app đang cài sẽ bỏ qua tải media (chỉ update code nếu code đổi).
"""
import argparse
import hashlib
import json
import os
import sys
import zipfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = os.path.join(REPO, "game")
OUT_MANIFEST = os.path.join(REPO, "assets-manifest.json")
MEDIA_DIRS = ["img", "snd", "music", "fx"]
EXCLUDE_FILES = {"sw.js", "README.md", "wrangler.jsonc", ".gitignore", ".gitattributes", ".assetsignore"}
EXCLUDE_DIRS = {".git", ".wrangler", ".zcode", ".claude", "android"}
ZIP_URL_BASE = "https://github.com/TanNhatCMS/volam-idle-android/releases/download/v{v}/{name}"
FIXED_ZIP_TIME = (2020, 1, 1, 0, 0, 0)


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def scan(only_dirs=None) -> list:
    out = []
    for root, dirs, names in os.walk(GAME):
        rel_root = os.path.relpath(root, GAME).replace(os.sep, "/")
        top = rel_root.split("/")[0] if rel_root != "." else ""
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        if only_dirs is not None and top not in only_dirs:
            continue
        if only_dirs is None and top in MEDIA_DIRS:
            continue
        for name in sorted(names):
            if name in EXCLUDE_FILES:
                continue
            p = os.path.join(root, name)
            rel = os.path.relpath(p, GAME).replace(os.sep, "/")
            out.append({"p": rel, "h": sha256(p), "s": os.path.getsize(p)})
    out.sort(key=lambda x: x["p"])
    return out


def code_version(files: list) -> str:
    blob = json.dumps(files, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", required=True, help="phien ban OTA, vd 1.3.0")
    args = ap.parse_args()
    version = args.version
    zip_name = f"ota-assets-{version}.zip"
    zip_path = os.path.join(REPO, zip_name)

    media = scan(only_dirs=set(MEDIA_DIRS))
    code = scan(only_dirs=None)

    with zipfile.ZipFile(zip_path, "w") as zf:
        for f in media:
            zi = zipfile.ZipInfo(f["p"], date_time=FIXED_ZIP_TIME)
            zi.compress_type = zipfile.ZIP_STORED
            zi.external_attr = 0o644 << 16
            with open(os.path.join(GAME, f["p"]), "rb") as src:
                zf.writestr(zi, src.read())
    zip_size = os.path.getsize(zip_path)
    zip_hash = sha256(zip_path)

    payload = {
        "otaVersion": 3,
        "media": {
            "zipName": zip_name,
            "zipUrl": ZIP_URL_BASE.format(v=version, name=zip_name),
            "zipSha256": zip_hash,
            "zipSize": zip_size,
            "totalBytes": sum(f["s"] for f in media),
            "files": media,
        },
        "code": {
            "version": code_version(code),
            "totalBytes": sum(f["s"] for f in code),
            "files": code,
        },
    }
    with open(OUT_MANIFEST, "w", encoding="utf-8", newline="\n") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"media: {len(media)} files, {sum(f['s'] for f in media)/1048576:.1f} MB | zip {zip_size/1048576:.1f} MB sha256={zip_hash[:12]}…")
    print(f"code:  {len(code)} files, {sum(f['s'] for f in code)/1048576:.1f} MB | version={code_version(code)[:12]}…")
    return 0


if __name__ == "__main__":
    sys.exit(main())
