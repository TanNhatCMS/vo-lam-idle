# Sinh lai jdata/jw.json: 38 zone "Ban do luyen cong" theo nguon (anh chup user 2026-10-14)
# - id/n/bg/sw: match tu bang maps (data.js clone goc); sw lech -> chuan hoa [20x5]
# - zone cu (16): giu nguyen pool m + boss (theme goc)
# - zone moi: pool ghep theo theme tu roster 111 quai; boss generic moi 859.. them dung ten cap
import json, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

JW_PATH = 'P:/VoLamIdleAndroid/game/jdata/jw.json'
jw = json.load(open(JW_PATH, encoding='utf-8'))
old_zones = {z['id']: z for z in jw['zones']}
mon = jw['mon']

# (map_id, ten, lo, hi, pool_cho_zone_moi, boss)  — boss None = tu sinh generic theo hi
NEW = [
    (140, 'Dược Vương Cốc', 1, 10, None, 141),
    (2, 'Hoa Sơn', 10, 20, None, 851),
    (195, 'Nhạn Đãng sơn', 20, 30, [35, 36, 37, 24, 25, 33], 852),
    (3, 'Kiếm Các Tây Bắc', 30, 40, None, 853),
    (7, 'Tần Lăng', 40, 50, None, 854),
    (19, 'Kiếm Các Tây Nam', 50, 60, None, 142),
    (70, 'Vũ Lăng sơn', 60, 70, None, 855),
    (43, 'Kiếm Các Trung Nguyên', 70, 80, [163, 165, 167, 159, 160, 152], 856),
    (179, 'La Tiêu sơn', 80, 90, [154, 155, 156, 39, 41, 33], 857),
    (92, 'Thục Cương sơn', 90, 100, None, 858),
    (90, 'Phục Ngưu Sơn Đông', 100, 110, None, 143),
    (193, 'Vũ Di sơn', 110, 120, [35, 36, 37, 34, 31, 9], None),
    (74, 'Miêu Lĩnh', 120, 130, [9, 10, 19, 20, 21, 45], None),
    (145, 'Tuyết Báo động tầng 1', 130, 140, [8, 4, 40, 3, 2, 7], None),
    (21, 'Thanh Thành sơn', 140, 152, None, None),
    (41, 'Phục Ngưu Sơn Tây', 152, 164, None, None),
    (122, 'Hoàng Hà Nguyên Đầu', 164, 176, None, None),
    (167, 'Điểm Thương sơn', 176, 188, [25, 26, 24, 15, 16, 17], None),
    (42, 'Thiên Tâm động', 188, 200, [27, 28, 29, 30, 45, 46], None),
    (56, 'Hoành Sơn Phái', 200, 212, None, None),
    (68, 'Thanh Loa đảo', 212, 224, [18, 20, 21, 22, 23, 41], None),
    (342, 'Vi sơn đảo', 224, 236, [18, 21, 22, 19, 41, 558], None),
    (341, 'Mạc Bắc Thảo Nguyên', 236, 248, [709, 710, 17, 13, 14, 7], None),
    (319, 'Lâm Du Quan', 248, 260, None, 720),
    (224, 'Sa mạc địa biểu', 260, 275, None, 145),
    (320, 'Chân núi Trường Bạch', 275, 290, None, 716),
    (123, 'Lão Hổ động', 290, 305, [0, 1, 2, 3, 4, 148], None),
    (225, 'Sa Mạc 1', 305, 320, [557, 558, 703, 704, 706, 705], None),
    (226, 'Sa Mạc 2', 320, 335, [703, 704, 705, 706, 557, 558], None),
    (93, 'Tiến Cúc động', 335, 350, [45, 46, 27, 28, 29, 30], None),
    (75, 'Khoả Lang động', 350, 365, [5, 6, 7, 8, 39, 10], None),
    (227, 'Sa Mạc 3', 365, 380, [704, 705, 706, 557, 558, 703], None),
    (321, 'Trường Bạch sơn Nam', 380, 400, [8, 40, 2, 15, 16, 148], None),
    (322, 'Trường Bạch sơn Bắc', 400, 420, None, 717),
    (336, 'Phong Lăng độ', 420, 440, [703, 704, 705, 706, 709, 710], None),
    (340, 'Mạc Cao Quật', 440, 460, [27, 28, 29, 30, 45, 46], None),
    (201, 'Băng Hà động', 460, 480, [8, 40, 2, 4, 3, 7], None),
    (205, 'Dương Trung động', 480, 500, [45, 46, 22, 23, 20, 19], None),
]
assert len(NEW) == 38

# sw tu bang maps (data.js) — zone cu giu sw cu neu co
s = open('P:/_demo/volam-idle/data.js', encoding='utf-8', errors='replace').read()
jx, _ = json.JSONDecoder().raw_decode(s[s.find('{'):])
maps = {m['id']: m for m in (jx['maps'] if isinstance(jx['maps'], list) else list(jx['maps'].values()))}

# boss generic moi: ten "Tieu Boss cap <hi>", clone template tu 851-858 (quay vong)
GEN_BASE = [851, 852, 853, 854, 855, 856, 857, 858]
next_id = 859
def generic_boss(hi):
    global next_id
    base = mon[str(GEN_BASE[next_id % 8])]
    bid = next_id
    mon[str(bid)] = dict(base, n=f'Tiểu Boss cấp {hi}')
    next_id += 1
    return bid

zones = []
for mid, name, lo, hi, pool, boss in NEW:
    old = old_zones.get(mid)
    m = old['m'] if old and old.get('m') else pool
    assert m, f'zone {mid} {name} thieu pool'
    b = boss if boss else generic_boss(hi)
    if old and old.get('sw'):
        sw = old['sw']
    else:
        sw = list(maps[mid].get('sw') or [])
        if not any(sw): sw = [20, 20, 20, 20, 20]
    zones.append({'id': mid, 'n': name, 'lo': lo, 'hi': hi, 'bg': f'img/z/{mid}.jpg', 'sw': sw, 'm': m, 'boss': b})

jw['zones'] = zones
json.dump(jw, open(JW_PATH, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('da ghi', JW_PATH, '-', len(zones), 'zones,', len(mon), 'mon (them', next_id - 859, 'boss generic)')
for z in zones:
    print(f"{z['id']:>4} | {z['n']:<24} | {z['lo']:>3}-{z['hi']:<3} | boss={z['boss']:<4} {mon[str(z['boss'])]['n']}")
