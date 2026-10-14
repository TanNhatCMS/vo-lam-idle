import zipfile
ota = zipfile.ZipFile('P:/VoLamIdleAndroid/ota-data-2.6.18.zip')
big_a = ota.read('_next/static/chunks/1wkvnj4cvql_t.js')
big_b = open('P:/VoLamIdleAndroid/game/_next/static/chunks/0wnubscvoxopl.js', 'rb').read()

# walk with resync: on mismatch, extend until we find a common run of 40 bytes
n = min(len(big_a), len(big_b))
i = 0
regions = []
while i < n:
    if big_a[i] != big_b[i]:
        j = i
        # extend while no 40-byte common anchor ahead
        while j < n:
            # check if a[j:j+40] == b[j:j+40]
            if j + 40 <= n and big_a[j:j+40] == big_b[j:j+40]:
                break
            j += 1
        regions.append((i, j))
        i = j
    else:
        i += 1
print("total regions:", len(regions))
tot = sum(j - i for i, j in regions)
print("total diff bytes (OTA side):", tot, " size delta:", len(big_b) - len(big_a))
big = sorted(regions, key=lambda r: r[1] - r[0], reverse=True)
for i, j in big[:8]:
    print("\n-- region @%d len %d" % (i, j - i))
    print("  OTA: %r" % big_a[max(0, i - 50):min(len(big_a), j + 50)])
    print("  NEW: %r" % big_b[max(0, i - 50):min(len(big_b), j + 50)])
