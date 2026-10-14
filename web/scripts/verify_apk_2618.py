import zipfile, hashlib
apk = zipfile.ZipFile('P:/VoLamIdleAndroid/app/build/outputs/apk/release/volam-idle-v2.6.18-release.apk')
names = apk.namelist()
# shell index.html chunk refs
html = apk.read('assets/game/index.html').decode('utf-8', 'ignore')
import re
refs = sorted(set(re.findall(r'_next/static/chunks/([A-Za-z0-9_-]+\.js)', html)))
print("APK index.html chunk refs:", refs)
# which state? HEAD-state chunks are 0wnubscvoxopl.js / 0yxhhxja54b_i.js
# post-release (09:54) chunks were 2y9mi1_zgalc1.js / 3q5ljzpnpmwz2.js(older name reused?) - check markers
post_markers = ['2y9mi1_zgalc1', '1wkvnj4cvql_t']
print("contains post-release chunk refs:", any(m in html for m in post_markers))
# icon check via packaged_res chain already done; verify res present
print("assets/game entries:", len([n for n in names if n.startswith('assets/game/')]))
# ui.ts 07:26 marker: skillModal detail - check 'skill-detail' class in shell chunks is absent (chunks not in APK)
# instead verify style.css is HEAD version (no AFK overlay css? actually AFK css was committed in a1d636e)
css = apk.read('assets/game/style.css').decode('utf-8', 'ignore')
print("style.css has #afk overlay css:", '#afk' in css)
print("style.css has bk90-picker css:", 'bk90-picker' in css)
print("style.css has achievement-page css:", 'achievement-page' in css)
