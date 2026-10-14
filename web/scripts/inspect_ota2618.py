import zipfile
z = zipfile.ZipFile('P:/VoLamIdleAndroid/ota-data-2.6.18.zip')
names = z.namelist()
print("ota-data entries:", len(names))
for n in names[:25]: print("  ", n)
print("...")
has_index = any(n.endswith('index.html') for n in names)
print("contains index.html:", has_index)
# find the _next build id referenced
import re
for n in names:
    if n.endswith('index.html'):
        html = z.read(n).decode('utf-8', 'ignore')
        m = re.findall(r'_next/static/([A-Za-z0-9_-]+)/', html)
        print("index.html buildIds:", set(m))
        chunks = re.findall(r'_next/static/chunks/([A-Za-z0-9_-]+\.js)', html)
        print("chunk refs:", chunks[:6])
