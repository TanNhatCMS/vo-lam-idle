import re, json, sys

src = open('v107-game.js', encoding='utf-8', errors='replace').read()

def grab(name, maxlen=2600):
    # find "function NAME(" or "var NAME=function" or "NAME=(" arrow
    pats = [re.compile(r'function ' + re.escape(name) + r'\('),
            re.compile(r'\b' + re.escape(name) + r'=function\b'),
            re.compile(r'\b' + re.escape(name) + r'=\(')]
    for p in pats:
        m = p.search(src)
        if m:
            start = m.start()
            print(f'===== {name} (at {start}, pattern {p.pattern[:20]}) =====')
            print(src[start:start + maxlen])
            print()
            return
    print(f'!! {name} NOT FOUND')

for fn in ['Ql', 'mb', 'fb', 'db', 'ub', 'dc']:
    grab(fn, 2200)

# makeEnemy $c — find its definition (function $c(...)
grab('$c', 1500)

# JX_TOWER2_BALANCE value
m = re.search(r'JX_TOWER2_BALANCE\s*=\s*(\{.{0,900})', src)
if m:
    print('===== JX_TOWER2_BALANCE =====')
    print(m.group(1)[:900])

# JX_TOWER_CHALLENGE_BALANCE
m = re.search(r'JX_TOWER_CHALLENGE_BALANCE\s*=\s*(\{.{0,500})', src)
if m:
    print('===== JX_TOWER_CHALLENGE_BALANCE =====')
    print(m.group(1)[:500])
