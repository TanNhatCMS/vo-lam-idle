import zipfile, difflib, os
ota = zipfile.ZipFile('P:/VoLamIdleAndroid/ota-data-2.6.18.zip')
small_ota = ota.read('_next/static/chunks/3q5ljzpnpmwz2.js').decode('utf-8', 'ignore')
small_new = open('P:/VoLamIdleAndroid/game/_next/static/chunks/0yxhhxja54b_i.js','rb').read().decode('utf-8', 'ignore')
print("=== SMALL CHUNK diff (OTA 3q5ljzpnpmwz2 vs new 0yxhhxja54b_i) ===")
sm = difflib.SequenceMatcher(None, small_ota, small_new)
for tag, i1, i2, j1, j2 in sm.get_opcodes():
    if tag != 'equal':
        print("[%s] OTA: %r" % (tag, small_ota[i1:i2][:300]))
        print("      NEW: %r" % (small_new[j1:j2][:300]))
print("\n=== BIG CHUNK: buildId occurrences ===")
big_ota = ota.read('_next/static/chunks/1wkvnj4cvql_t.js').decode('utf-8', 'ignore')
big_new = open('P:/VoLamIdleAndroid/game/_next/static/chunks/0wnubscvoxopl.js','rb').read().decode('utf-8', 'ignore')
bid_ota = 'woQnlTkjPAa0pfgcS6AgF'
print("buildId in OTA big chunk:", big_ota.count(bid_ota))
# find the new build id from index.html
import re
html = open('P:/VoLamIdleAndroid/game/index.html').read()
m = re.search(r'_next/static/([A-Za-z0-9_-]{20})/', html)
bid_new = m.group(1) if m else '?'
print("new buildId:", bid_new, "in new big chunk:", big_new.count(bid_new))
print("\n=== BIG CHUNK diff summary ===")
sm2 = difflib.SequenceMatcher(None, big_ota, big_new)
ops = [o for o in sm2.get_opcodes() if o[0] != 'equal']
print("non-equal regions:", len(ops), "total delta bytes:", sum(max(o[2]-o[1], o[4]-o[3]) for o in ops))
for tag, i1, i2, j1, j2 in ops[:6]:
    print("[%s] OTA: %r" % (tag, big_ota[i1:i2][:200]))
    print("      NEW: %r" % (big_new[j1:j2][:200]))
