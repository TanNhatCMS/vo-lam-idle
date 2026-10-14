import zipfile, hashlib, os
ota = zipfile.ZipFile('P:/VoLamIdleAndroid/ota-data-2.6.18.zip')
ota_chunks = {n.split('/')[-1]: z for n, z in
              ((n, ota.read(n)) for n in ota.namelist() if '/chunks/' in n and n.endswith('.js'))}
print("OTA chunks:")
for k, v in sorted(ota_chunks.items()):
    print("  %-28s %8d  %s" % (k, len(v), hashlib.sha256(v).hexdigest()[:12]))
print("\nRebuilt game/ chunks:")
d = 'P:/VoLamIdleAndroid/game/_next/static/chunks'
now = {}
for f in os.listdir(d):
    if f.endswith('.js'):
        b = open(os.path.join(d, f), 'rb').read()
        now[f] = b
        print("  %-28s %8d  %s" % (f, len(b), hashlib.sha256(b).hexdigest()[:12]))
# match by content
ota_by_hash = {hashlib.sha256(v).hexdigest(): k for k, v in ota_chunks.items()}
print("\nContent matching (rebuilt -> OTA):")
matched = 0
for k, v in sorted(now.items()):
    h = hashlib.sha256(v).hexdigest()
    if h in ota_by_hash:
        print("  %-28s == %s" % (k, ota_by_hash[h])); matched += 1
    else:
        print("  %-28s != ANY OTA chunk" % k)
print("matched %d/%d" % (matched, len(now)))
