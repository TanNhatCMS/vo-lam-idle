#!/usr/bin/env python3
"""Sinh OTA ZIP + assets-manifest.json cho app Android (OtaManager.kt).

Quy trinh phat hanh ban cap nhat game:
  1. Copy file game moi vao game/
  2. python tools/make_ota_manifest.py --version 1.2.0
     -> tao ota-assets-1.2.0.zip (media img/snd/music/fx) + cap nhat assets-manifest.json
  3. git add assets-manifest.json + commit + push
  4. gh release create v1.2.0 ota-assets-1.2.0.zip (APK build rieng)
App tai manifest tu repo -> so zipSha256 voi ban da cai -> tai ZIP kem release
-> verify -> giai nen -> cai. Code JS luon bundle trong APK, khong qua OTA.
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
SCAN_DIRS = ["img", "snd", "music", "fx"]
ZIP_URL_BASE = "https://github.com/TanNhatCMS/volam-idle-android/releases/download/v{v}/{name}"


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", required=True, help="phien ban OTA, vd 1.1.0")
    args = ap.parse_args()
    version = args.version
    zip_name = f"ota-assets-{version}.zip"
    zip_path = os.path.join(REPO, zip_name)

    files = []
    for d in SCAN_DIRS:
        base = os.path.join(GAME, d)
        if not os.path.isdir(base):
            continue
        for root, _dirs, names in os.walk(base):
            for name in sorted(names):
                p = os.path.join(root, name)
                rel = os.path.relpath(p, GAME).replace(os.sep, "/")
                files.append({"p": rel, "h": sha256(p), "s": os.path.getsize(p)})
    files.sort(key=lambda x: x["p"])

    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_STORED) as zf:
        for f in files:
            zf.write(os.path.join(GAME, f["p"]), f["p"])
    zip_size = os.path.getsize(zip_path)
    zip_hash = sha256(zip_path)

    payload = {
        "otaVersion": 2,
        "zipName": zip_name,
        "zipUrl": ZIP_URL_BASE.format(v=version, name=zip_name),
        "zipSha256": zip_hash,
        "zipSize": zip_size,
        "totalBytes": sum(f["s"] for f in files),
        "files": files,
    }
    with open(OUT_MANIFEST, "w", encoding="utf-8", newline="\n") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{len(files)} files, {sum(f['s'] for f in files)/1048576:.1f} MB")
    print(f"zip: {zip_name} {zip_size/1048576:.1f} MB sha256={zip_hash[:16]}…")
    return 0


if __name__ == "__main__":
    sys.exit(main())
