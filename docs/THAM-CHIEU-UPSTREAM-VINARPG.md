# Tham chiếu upstream: volam.vinarpg.com

Game `volam.vinarpg.com` là **anh em ruột cùng dòng engine** với project này (cùng
nguồn data JX1, cùng vocabulary module: core/mapobs/combat/loot/sets/…), phát triển
đ nhanh hơn mình. Bản clone tĩnh toàn bộ game nằm tại `P:\volam.vinarpg.com`
(cào 2026-10-06, game version `20261006-v9`) — dùng làm nguồn tham chiếu thiết kế.

## Canh update upstream (quan trọng)

Mỗi file code ở origin có stamp phiên bản riêng `?v=20261006-…` trong index.html.
Thư mục `P:\volam.vinarpg.com\_ref\` chứa manifest **sha256 + stamp của 49 file code**
và script rà soát:

```bash
cd P:/volam.vinarpg.com/_ref
python track-upstream.py            # báo file nào upstream đã đổi
python track-upstream.py check --fetch   # tải file đổi về _ref/updates/<ngày>/ để review
python track-upstream.py snapshot        # refresh manifest sau khi cập nhật clone
```

Chi tiết: `_ref/README.md`. Trạng thái lần chốt gần nhất: 2026-10-07 — chỉ
`js/chat.js` (v18l1→v18) khác snapshot; còn lại khớp 100%.

## Vì sao port được (đã đối chiếu 2026-10-06/07)

- **Data trùng khớp 100%**: `data.js` (window.JX) ≡ `web/public/jdata/jx.json` từng
  bảng (236 skill, 2151 NPC, 992 map, 330 affix, 1763 đồ, 4 shop); `world.js` (JW)
  ≡ `jw.json` (16 zone, town Biện Kinh).
- **Media trùng khớp** trừ một điểm: họ có `img/jx/` **6.881 sprite nhân vật ghép
  bộ phận** (f/m) thay cho `img/p/` 10 file của mình — nâng cấp hình ảnh lớn nhất.
- **Khung DOM 1:1**: App.tsx giữ đúng id/class bản gốc nên style.css của họ thả
  vào restyle được phần lớn game (783 dòng, 176 tokens, 9 keyframes, 12 media
  query vs 317 dòng/13 tokens/4 keyframes/1 media query của mình). Font đã giống
  nhau (IBM Plex Mono).

## Hệ thống họ có thêm (thứ tự port đề xuất)

1. **Đơn kho** (`js/donkho.js`) — gom trang sức thành Huyền Tinh + bán đồ rác theo lọc, có lớp bảo vệ.
2. **Sổ tay** (`js/journal.js`) — thống kê 7 ngày lưu trong save.
3. **Bùa lợi / bùa hại / vòng sáng** (`js/skillsys.js`) — lớp buff–debuff–aura, combat mình chưa có.
4. **Tây điểm + 3 bộ võ học** (`js/builds.js`) — 3 build điểm/nhân vật.
5. **Thần Mã Các** (`js/horse.js`) — ngựa cưỡi + huấn luyện + ngũ đại thần mã/danh mã.
6. **Tháp II** (`js/tower2-balance.js` + `depth.js`) — tới 2.000 tầng, điểm TS6–TS10.
7. **Tam pháp chuyển sinh / biến thể tuần / thử thách nhân vật** (`js/depth.js`).
8. **Bang Hội / Đả Tàu / Tổng Kim** (`js/activities.js`).
9. **Đổi skin UI** — style.css + bộ `ui/` mới của họ (yuanbao, jade texture, s0–s4…).
10. **Sprite `img/jx` + render ghép bộ phận** (`jxlook.js` + `js/jxparts.js` + `js/look.js`) — nặng ~206MB, cân nhắc gói OTA.
11. **Thành thị + bãi quái ngoài bản đồ** (`field-spawn.js`, townBar) — đổi hình thế gameplay.
12. **Chat thế giới** (`js/chat.js` + proxy trong `serve.py`) — cần hạ tầng server.

Mình đã có sẵn (đừng port trùng): chuyển sinh 5 lần, Tháp thử thách, danh hiệu
achievement, Pet/Đồng hành, Boss Thế Giới + gacha Vỏ Sò, kho chung, Luyện công,
rèn, công thức, guide, admin. Họ cũng có pet/guild riêng — đối chiếu trước khi làm.

## Nguyên tắc port

Code vinarpg là sản phẩm của tác giả khác đang vận hành game thật — dùng clone làm
**tài liệu thiết kế**, tự viết lại trong codebase TS như đợt Pet/World Boss; không
chép nguyên file. Data JX1 + sprite `img/jx` cùng nguồn asset JX1 với những gì
project đang dùng.
