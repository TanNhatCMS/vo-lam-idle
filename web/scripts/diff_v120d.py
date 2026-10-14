# Block diff 512B: tim dao thay doi that (bo qua noise doi ten)
import hashlib, sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

a = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.zZ5P793c.js', 'rb').read()
b = open('P:/volam.vinarpg.com/_ref/updates/2026-10-14/game.DzZ2mNZ0.js', 'rb').read()
B = 512
ha = {}
for i in range(0, len(a) - B, B):
    ha.setdefault(hashlib.md5(a[i:i+B]).digest(), []).append(i)

diffs = []
ia = ib = 0
while ia < len(a) - B and ib < len(b) - B:
    if a[ia:ia+B] == b[ib:ib+B]:
        ia += B; ib += B; continue
    k = 0
    while True:
        k += B
        if ia + k + 4*B > len(a) or ib + k + 4*B > len(b): break
        if all(a[ia+k+t*B:ia+k+(t+1)*B] == b[ib+k+t*B:ib+k+(t+1)*B] for t in range(4)): break
    # chi lay dao ngan (<24KB): dao dai = noise doi ten toan cuc
    if k <= 24*B:
        diffs.append((ia, ib, k))
    ia += k; ib += k
print('dao thay doi ngan:', len(diffs))
A = a.decode('utf-8', 'replace'); Bb = b.decode('utf-8', 'replace')
for n, (ia, ib, k) in enumerate(diffs):
    print(f'\n===== ISLAND {n+1}: v119@{ia} len~{k}B =====')
    print('OLD:', A[max(0, ia-100):ia+min(k+150, 650)].replace('\n', ' ')[:780])
    print()
    print('NEW:', Bb[max(0, ib-100):ib+min(k+150, 650)].replace('\n', ' ')[:780])
    print()
