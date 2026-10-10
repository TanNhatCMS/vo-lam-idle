#!/usr/bin/env python3
"""Sinh OTA ZIP tài nguyên + assets-manifest.json cho app Android (OtaManager.kt).

Manifest v6 — tài nguyên tách 2 gói theo tần suất thay đổi, mỗi gói một ZIP
đính kèm GitHub Release + bản vá riêng:
  - data   : ZIP ota-data-<v>.zip   — index.html, js, data.js, fonts, ui
             (~1MB, THƯỜNG SỬA — chỉ còn code, dữ liệu đã sang gói assets)
  - assets : ZIP ota-assets-<v>.zip — img, snd, music, fx, jdata (~119MB, ÍT SỬA)
             (jdata = dữ liệu game JSON: jx, jw, jfx, jmo, jsnd — xem docs/DU-LIEU-MEDIA.md)
  - patch  : { "data": {...}|null, "assets": {...}|null } — bản vá từng gói:
             chỉ chứa file THAY ĐỔI/THÊM MỚI so với bản phát hành TRƯỚC +
             danh sách file bị xóa. App áp vá của gói nào khi dataVersion/
             assetsVersion đang cài == patch.<gói>.from; lệch nhánh thì tải
             lại full gói đó. patch.<gói> = null nếu không có gì đổi.

Quy trình phát hành:
  1. Copy file game mới vào game/
  2. python tools/make_ota_manifest.py --version 1.4.0 --notes "Mô tả bản cập nhật"
     (tool đọc manifest bản trước từ git HEAD để tính bản vá;
      --notes ghi vào manifest để app hiện mô tả khi có bản mới —
      cùng nội dung --notes của gh release create bước 4)
  3. git add assets-manifest.json && git commit && git push
  4. gh release create v1.4.0 <apk> ota-data-1.4.0.zip ota-assets-1.4.0.zip --notes "…"
     (chỉ đính kèm ZIP gói có thay đổi — gói không đổi không cần ZIP mới)
ZIP tạo với timestamp cố định nên deterministic.
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import zipfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = os.path.join(REPO, "game")
OUT_MANIFEST = os.path.join(REPO, "assets-manifest.json")
MEDIA_DIRS = ["img", "snd", "music", "fx", "jdata"]  # gói assets (media + dữ liệu game JSON); còn lại thuộc gói data
EXCLUDE_FILES = {"sw.js", "README.md", "wrangler.jsonc", ".gitignore", ".gitattributes", ".assetsignore"}
EXCLUDE_DIRS = {".git", ".wrangler", ".zcode", ".claude", "android"}
ZIP_URL_BASE = "https://github.com/TanNhatCMS/vo-lam-idle/releases/download/v{v}/{name}"
FIXED_ZIP_TIME = (2020, 1, 1, 0, 0, 0)


def sha256(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def scan(only_assets: bool) -> list:
    """Gói assets = các thư mục media; gói data = mọi thứ còn lại."""
    out = []
    for root, dirs, names in os.walk(GAME):
        rel_root = os.path.relpath(root, GAME).replace(os.sep, "/")
        top = rel_root.split("/")[0] if rel_root != "." else ""
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        if top in EXCLUDE_DIRS:
            continue
        in_media = top in MEDIA_DIRS
        if in_media != only_assets:
            continue
        for name in sorted(names):
            if name in EXCLUDE_FILES:
                continue
            p = os.path.join(root, name)
            rel = os.path.relpath(p, GAME).replace(os.sep, "/")
            out.append({"p": rel, "h": sha256(p), "s": os.path.getsize(p)})
    out.sort(key=lambda x: x["p"])
    return out


def build_zip(kind: str, files: list, sources: dict) -> dict:
    zip_name = f"ota-{kind}-{version}.zip"
    zip_path = os.path.join(REPO, zip_name)
    with zipfile.ZipFile(zip_path, "w") as zf:
        for f in files:
            zi = zipfile.ZipInfo(f["p"], date_time=FIXED_ZIP_TIME)
            zi.compress_type = zipfile.ZIP_STORED
            zi.external_attr = 0o644 << 16
            with open(sources[f["p"]], "rb") as src:
                zf.writestr(zi, src.read())
    return {
        "zipName": zip_name,
        "zipUrl": ZIP_URL_BASE.format(v=version, name=zip_name),
        "zipSha256": sha256(zip_path),
        "zipSize": os.path.getsize(zip_path),
        "totalBytes": sum(f["s"] for f in files),
        "files": files,
    }


def release_notes(ver: str, explicit: str | None) -> str:
    """Mô tả bản cập nhật ghi vào manifest — app hiện khi có bản mới.
    Ưu tiên --notes (chạy TRƯỚC gh release create nên release chưa có);
    không có thì thử đọc release đã tạo (chạy lại sau bước 4); không được
    thì để trống. Cắt 2000 ký tự cho manifest gọn."""
    if explicit is not None:
        return explicit.strip()[:2000]
    try:
        r = subprocess.run(
            ["gh", "release", "view", f"v{ver}", "--json", "body", "--jq", ".body"],
            capture_output=True, check=True,
        ).stdout.decode("utf-8", errors="replace")
        return r.strip()[:2000]
    except Exception:
        return ""


def previous_manifest() -> dict | None:
    """Manifest của bản phát hành trước (commit ở HEAD), trả None nếu không đọc được."""
    try:
        blob = subprocess.run(
            ["git", "show", "HEAD:assets-manifest.json"],
            cwd=REPO, capture_output=True, check=True,
        ).stdout
        return json.loads(blob)
    except Exception as e:
        print(f"(khong doc duoc manifest cu tu git HEAD: {e} — bo qua ban va)")
        return None


def old_parts(old: dict) -> dict | None:
    """{tên gói: {zipSha256, files}} của manifest cũ. Hỗ trợ v4/v6 (data+media/assets)
    và v5 (data full — tự tách theo MEDIA_DIRS)."""
    if not isinstance(old, dict):
        return None
    out: dict[str, dict] = {}
    if "data" in old and isinstance(old["data"], dict):          # v6
        out["data"] = old["data"]
        out["assets"] = old.get("assets", {}) if isinstance(old.get("assets"), dict) else {}
    elif isinstance(old.get("resource"), dict):                  # v4
        res = old["resource"]
        if isinstance(res.get("data"), dict):
            out["data"] = res["data"]
        if isinstance(res.get("media"), dict):
            out["assets"] = res["media"]
    elif isinstance(old.get("data"), dict) and old["data"].get("files"):  # v5: data full
        full = old["data"]["files"]
        out["data"] = {"zipSha256": old["data"].get("zipSha256"),
                       "files": [f for f in full if f["p"].split("/")[0] not in MEDIA_DIRS]}
        out["assets"] = {"zipSha256": None,
                         "files": [f for f in full if f["p"].split("/")[0] in MEDIA_DIRS]}
    return out if out.get("data", {}).get("files") else None


version = ""  # đặt trong main(), dùng bởi build_zip


def build_patch(kind: str, old_part: dict, new_files: list, sources: dict) -> dict | None:
    old_map = {f["p"]: f["h"] for f in old_part.get("files", [])}
    new_map = {f["p"]: f["h"] for f in new_files}
    changed = [f for f in new_files if old_map.get(f["p"]) != f["h"]]
    removed = sorted(p for p in old_map if p not in new_map)
    if not changed and not removed:
        print(f"patch {kind:6s}: khong co gi thay doi")
        return None
    desc = build_zip(f"{kind}-patch", changed, sources)  # zip ota-<kind>-patch-<v>.zip
    desc["from"] = old_part.get("zipSha256") or ""
    desc["remove"] = removed
    return desc


def main() -> int:
    global version
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", required=True, help="phien ban OTA, vd 1.4.0")
    ap.add_argument("--notes", default=None,
                    help="mo ta ban cap nhat ghi vao manifest (app hien khi co ban moi); "
                         "nen dung cung noi dung --notes cua gh release create")
    args = ap.parse_args()
    version = args.version

    data_files = scan(only_assets=False)
    assets_files = scan(only_assets=True)
    sources = {f["p"]: os.path.join(GAME, f["p"]) for f in data_files + assets_files}
    data_desc = build_zip("data", data_files, sources)
    assets_desc = build_zip("assets", assets_files, sources)

    # ---------- Bản vá từng gói: diff so với bản phát hành trước ----------
    patches: dict[str, dict | None] = {"data": None, "assets": None}
    old = previous_manifest()
    old_parts_map = old_parts(old) if old else None
    if old_parts_map:
        for kind, new_files, new_desc in (
            ("data", data_files, data_desc),
            ("assets", assets_files, assets_desc),
        ):
            old_part = old_parts_map.get(kind)
            if not old_part or not old_part.get("zipSha256"):
                print(f"patch {kind:6s}: bo qua (khong co ban truoc cua goi nay)")
                continue
            p = build_patch(kind, old_part, new_files, sources)
            if p is None:
                continue
            ratio = p["zipSize"] * 100 // max(new_desc["zipSize"], 1)
            if ratio > 60:  # vá gần bằng full thì bỏ, cho tải full cho nhanh
                print(f"patch {kind:6s}: bo qua (chiem ~{ratio}% full) — chi phat full")
                p = None
            else:
                print(f"patch {kind:6s}: {len(p['files'])} doi/them, {len(p['remove'])} xoa | "
                      f"zip {p['zipSize']/1048576:.2f} MB (~{ratio}% full) "
                      f"tu {p['from'][:12]}…")
            patches[kind] = p
    else:
        print("patch: bo qua (khong co ban truoc dinh dang moi de diff)")

    payload = {
        "otaVersion": 6,
        "version": version,
        "notes": release_notes(version, args.notes),
        "data": data_desc,
        "assets": assets_desc,
        "patch": patches,
    }
    with open(OUT_MANIFEST, "w", encoding="utf-8", newline="\n") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))

    print(f"data  : {len(data_files)} files, {data_desc['totalBytes']/1048576:6.1f} MB | "
          f"zip {data_desc['zipSize']/1048576:6.1f} MB sha256={data_desc['zipSha256'][:12]}… ({data_desc['zipName']})")
    print(f"assets: {len(assets_files)} files, {assets_desc['totalBytes']/1048576:6.1f} MB | "
          f"zip {assets_desc['zipSize']/1048576:6.1f} MB sha256={assets_desc['zipSha256'][:12]}… ({assets_desc['zipName']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
