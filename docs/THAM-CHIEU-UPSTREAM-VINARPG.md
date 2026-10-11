# Tham chiếu upstream: volam.vinarpg.com

Game `volam.vinarpg.com` là **anh em ruột cùng dòng engine** với project này (cùng
nguồn data JX1, cùng vocabulary module: core/mapobs/combat/loot/sets/…), phát triển
đ nhanh hơn mình. Bản clone tĩnh toàn bộ game nằm tại `P:\volam.vinarpg.com`
— dùng làm nguồn tham chiếu thiết kế.

**Cập nhật 2026-10-11**: upstream đổi sang bundle Vite
(`/assets/game.B97Ebn6h.js` 5MB + `js/doll-data.js` 1.76MB),
game version `20261011-v91`. Code cũ 06-10 lưu tại
`P:\volam.vinarpg.com\_ref\archive-20261006\`. Phân tích tính năng
mới: [docs/UPSTREAM-2026-10-11.md](UPSTREAM-2026-10-11.md) — hệ mới
nhất: **Tỷ Võ (PvP vs bot), Kỳ Trân Các + KNB, BXH (api/rankings),
Doll/JDOLL, Võ Huân, Lĩnh ngộ cấp 90**.

## Canh update upstream (quan trọng)

Mỗi file code ở origin có stamp phiên bản riêng `?v=20261011-…` trong
index.html. Thư mục `P:\volam.vinarpg.com\_ref\` chứa manifest
**sha256 + stamp** và script rà soát:

```bash
cd P:/volam.vinarpg.com/_ref
python track-upstream.py            # báo file nào upstream đã đổi
python track-upstream.py check --fetch   # tải file đổi về _ref/updates/<ngày>/ để review
python track-upstream.py snapshot        # refresh manifest sau khi cập nhật clone
```

Chi tiết: `_ref/README.md`. Trạng thái lần chốt gần nhất: 2026-10-11 —
clone khớp origin 100% (bundle `20261011-v91`). Trước đó (06-10):
49 file code rời, đã lưu trữ ở `_ref/archive-20261006/`.

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

## Hệ thống họ có thêm

Đợt 06-10 (đã port xong đợt 14): Đơn kho, Sổ tay, Bùa lợi/bùa hại/vòng
sáng, Tây điểm + 3 bộ võ học, Thần Mã Các, Tháp II, Tam pháp chuyển sinh,
Bang Hội/Đả Tàu/Tổng Kim, skin UI, sprite `img/jx`, thành thị + bãi quái,
chat thế giới.

**Đợt 11-10 (xem docs/UPSTREAM-2026-10-11.md)**: Tỷ Võ
(PvP vs bot, Võ Huân), Kỳ Trân Các + KNB, BXH (api/rankings), Doll/JDOLL,
Lĩnh ngộ võ công 90 / Mật Tịch, auto tiết kiệm pin / vượt cấp, cân bằng
Sức mạnh → Chính xác.
**Đã port từ đợt này (2026-10-11)**: Tẩy Tỵ Kinh + Dịch Căn Kinh +
chuyển sinh giữ điểm sách (save: `useN`, `attrBookBonus`; sách rơi
từ trùm cấp 80+) + **bảng level theo nguồn** (MAX_LEVEL 1000, exp
công thức `floor(100·n^2.2·(1+n/500))`, chuyển sinh cấp 100 +25/lần,
mốc cấp đến 180). Test: `tests/f8-sach-diem.spec.ts`.

Mình đã có sẵn (đừng port trùng): chuyển sinh 5 lần, Tháp thử thách, danh hiệu
achievement, Pet/Đồng hành, Boss Thế Giới + gacha Vỏ Sò, kho chung, Luyện công,
rèn, công thức, guide, admin. Họ cũng có pet/guild riêng — đối chiếu trước khi làm.

## Nguyên tắc port

Code vinarpg là sản phẩm của tác giả khác đang vận hành game thật — dùng clone làm
**tài liệu thiết kế**, tự viết lại trong codebase TS như đợt Pet/World Boss; không
chép nguyên file. Data JX1 + sprite `img/jx` cùng nguồn asset JX1 với những gì
project đang dùng.
