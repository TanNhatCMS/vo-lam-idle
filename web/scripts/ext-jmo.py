import sys
src = open('web/scripts/v107-game.js', encoding='utf-8', errors='replace').read()
BS = chr(92)
for name in ['JMO', 'JFX', 'JS', 'JX', 'JXLOOK']:
    tag = 'window.' + name + '='
    i = src.find(tag)
    if i < 0:
        print(name, "not found")
        continue
    depth = 0
    j = i + len(tag)
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
        elif c == '[':
            depth += 1
        elif c == ']':
            depth -= 1
            if depth == 0:
                break
        j += 1
    frag = src[i + len(tag):j + 1]
    open('web/scripts/v107-' + name.lower() + '-raw.txt', 'w', encoding='utf-8').write(frag)
    print(name, "at", i, "len", len(frag), "tail:", frag[-60:])
