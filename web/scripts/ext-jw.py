import sys
src = open('web/scripts/v107-game.js', encoding='utf-8', errors='replace').read()
i = src.find('window.JW={')
print("window.JW at:", i)
BS = chr(92)
depth = 0
j = i + len('window.JW=')
in_str = None
esc = False
while j < len(src):
    c = src[j]
    if esc:
        esc = False
    elif c == BS:
        esc = True
    elif in_str:
        if c == in_str:
            in_str = None
    elif c in ('`', '"', "'"):
        in_str = c
    elif c == '{':
        depth += 1
    elif c == '}':
        depth -= 1
        if depth == 0:
            break
    j += 1
frag = src[i + len('window.JW='):j + 1]
open('web/scripts/v107-jw-raw.txt', 'w', encoding='utf-8').write(frag)
print("extracted", len(frag), "chars")
print("tail:", frag[-100:])
