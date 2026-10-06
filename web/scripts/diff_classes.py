import re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

SRC = r'P:/VoLamIdleAndroid/web/src'
OLD = r'P:/VoLamIdleAndroid/web/public/style.css'
NEW = r'P:/volam.vinarpg.com/style.css'

def css_classes(path):
    txt = open(path, encoding='utf-8', errors='replace').read()
    txt = re.sub(r'/\*.*?\*/', '', txt, flags=re.S)
    names = set(re.findall(r'\.([a-zA-Z_][a-zA-Z0-9_-]*)', txt))
    return names, txt

used = set()
import os
for dp, dn, fn in os.walk(SRC):
    for f in fn:
        if not f.endswith(('.ts', '.tsx')): continue
        t = open(os.path.join(dp, f), encoding='utf-8', errors='replace').read()
        # class="..." / className="..." / classList.add('x') / classList.toggle('x', ...)
        for m in re.finditer(r'class(?:Name)?\s*=\s*[`\'"]([^`\'"]+)[`\'"]', t):
            for w in re.findall(r'[a-zA-Z_][a-zA-Z0-9_-]*', m.group(1)):
                if w not in ('true','false'): used.add(w)
        for m in re.finditer(r'classList\.(?:add|toggle|remove)\(\s*[\'"`]([^\'"`)]+)', t):
            for w in re.findall(r'[a-zA-Z_][a-zA-Z0-9_-]*', m.group(1)): used.add(w)
        # over-approx: tat ca chuoi trong source (bat ca class nam trong template literal / ternary)
        for m in re.finditer(r'[\'"]([^\'"\n]{2,60})[\'"]', t):
            for w in re.findall(r'[a-zA-Z_][a-zA-Z0-9_-]*', m.group(1)): used.add(w)

old_names, old_txt = css_classes(OLD)
new_names, new_txt = css_classes(NEW)

covered = used & (old_names | new_names)
missing_new = sorted(covered - new_names)     # code dung nhung css vinarpg khong co
print('== class code dung, OLD css co, VINARPG css THIEU (phai port sang) ==')
for c in missing_new: print('  .' + c)
print()
print('== class code dung ma CA HAI css deu khong co (kiem tra tay) ==')
for c in sorted(used - old_names - new_names): print('  .' + c)
print()
print('== OLD css selector khong duoc code nao dung (bo duoc) ==')
dead = sorted(old_names - used)
print('  ' + ', '.join('.' + c for c in dead))
