# So v119 vs v120 bang khoi 4KB (hash) -> tim vung diff, in ngu canh
import hashlib, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

a = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.zZ5P793c.js', 'rb').read()
b = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.DzZ2mNZ0.js', 'rb').read()
B = 4096
# map hash -> danh sach offset o a (khoi trung lap it nghia)
h = {}
for i in range(0, len(a) - B, B):
    h.setdefault(hashlib.md5(a[i:i+B]).digest(), []).append(i)

# so khối theo offset tuong ung truoc; khi lech thi tim khoi b tiep theo xuat hien lai o a (insert/delete)
diffs = []
ia = ib = 0
while ia < len(a) - B and ib < len(b) - B:
    if a[ia:ia+B] == b[ib:ib+B]:
        ia += B; ib += B; continue
    # tim khoi b[ib] xuat hien o a sau ia (delete o a) hoac khoi a[ia] xuat hien o b sau ib (insert)
    hb = hashlib.md5(b[ib:ib+B]).digest(); ha = hashlib.md5(a[ia:ia+B]).digest()
    ja = next((x for x in h.get(hb, []) if x >= ia), None)
    # don gian: danh dau vung lech va nhan bang khoi giong nhau gan nhat
    step = B
    # tim do dai vung lech: quet toi khi a[ia+k:] va b[ib+k:] giong nhau lai trong 4 khoi lien tiep
    k = 0
    while True:
        k += B
        if ia + k + 4*B > len(a) or ib + k + 4*B > len(b): break
        if all(a[ia+k+t*B:ia+k+(t+1)*B] == b[ib+k+t*B:ib+k+(t+1)*B] for t in range(4)): break
    diffs.append((ia, ib, k))
    ia += k; ib += k
print('so vung diff:', len(diffs))
A = a.decode('utf-8', 'replace'); Bb = b.decode('utf-8', 'replace')
for n, (ia, ib, k) in enumerate(diffs):
    print(f'\n===== DIFF {n+1}: v119@{ia} len~{k} =====')
    print('OLD:', A[max(0,ia-120):ia+min(k+200, 700)].replace('\n', ' ')[:850])
    print()
    print('NEW:', Bb[max(0,ib-120):ib+min(k+200, 700)].replace('\n', ' ')[:850])
    print()
