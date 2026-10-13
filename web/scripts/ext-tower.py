#!/usr/bin/env python3
"""Trích doan code Thap (tower) tu bundle v107 — tim theo marker, cat theo ngoac."""
import re, sys

BS = chr(92)
src = open('v107-game.js', encoding='utf-8').read()

def find_all(needle):
    out, i = [], 0
    while True:
        i = src.find(needle, i)
        if i < 0:
            return out
        out.append(i)
        i += 1

def bracket_span(start):
    """Tu vi tri start (ngay truoc '{'), tra ve (end_exclusive, depth)."""
    depth = 0
    i = start
    instr = None
    while i < len(src):
        ch = src[i]
        if instr:
            if ch == BS:
                i += 2
                continue
            if ch == instr:
                instr = None
            i += 1
            continue
        if ch in ('"', '`', "'"):
            instr = ch
            i += 1
            continue
        if ch == '{':
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return -1

# 1) Ham Sx — UI thap: tim marker "Dien nang cao" (Điểm nâng cao)
for marker in ['Điểm nâng cao', 'Luật tuần này', 'Phân bổ']:
    pos = find_all(marker)
    print(f'marker {marker!r}: {len(pos)} tai {pos[:6]}')

# tim function chua "Dien nang cao": quay nguoc den "function XXX(" gan nhat
def enclosing_func(pos):
    # quay nguoc tim "function " gan nhat truoc pos
    i = src.rfind('function', 0, pos)
    while i >= 0:
        # ten ham
        m = re.compile(r'function\s+([A-Za-z_$][\w$]*)\s*\(').match(src, i)
        if m:
            name = m.group(1)
            arg_end = src.find(')', i)
            body_start = src.find('{', arg_end)
            if body_start >= 0 and body_start < pos:
                end = bracket_span(body_start)
                return name, i, body_start, end
        i = src.rfind('function', 0, i)
    return None

pos = find_all('Điểm nâng cao')[0]
f = enclosing_func(pos)
if f:
    name, s, bs, be = f
    print(f'UI func: {name} [{s}:{be}] len={be-s}')
    open('tower-ui-raw.js', 'w', encoding='utf-8').write(src[s:be])
else:
    print('khong tim thay ham UI')
