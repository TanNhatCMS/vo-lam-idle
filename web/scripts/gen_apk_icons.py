# Sinh bo icon launcher APK tu logo samurai (android-chrome-512x512)
# Nguon: P:/volam.vinarpg.com/android-chrome-512x512.png (512x512, goc trong suot, nen #FEFBF1)
# Legacy ic_launcher: hinh vuong DAC (do goc trong suot tren launcher cu) -> ghep nen kem
# Adaptive foreground: full-bleed 108dp-scale (108/162/216/324/432), goc trong suot OK vi mask cat goc
import os
from PIL import Image

SRC = "P:/volam.vinarpg.com/android-chrome-512x512.png"
RES = "P:/VoLamIdleAndroid/app/src/main/res"
BG = (254, 251, 241, 255)  # #FEFBF1 nen kem cua logo

LEGACY = {  # density -> canh hinh vuong launcher
    "mipmap-mdpi": 48, "mipmap-hdpi": 72, "mipmap-xhdpi": 96,
    "mipmap-xxhdpi": 144, "mipmap-xxxhdpi": 192,
}
FOREGROUND = {  # density -> canh foreground adaptive (108dp x density)
    "mipmap-mdpi": 108, "mipmap-hdpi": 162, "mipmap-xhdpi": 216,
    "mipmap-xxhdpi": 324, "mipmap-xxxhdpi": 432,
}

logo = Image.open(SRC).convert("RGBA")

for density, size in LEGACY.items():
    tile = Image.new("RGBA", (size, size), BG)
    tile.alpha_composite(logo.resize((size, size), Image.LANCZOS))
    out = os.path.join(RES, density, "ic_launcher.png")
    tile.convert("RGB").save(out, "PNG", optimize=True)
    print("legacy", density, size, os.path.getsize(out), "B")

for density, size in FOREGROUND.items():
    out = os.path.join(RES, density, "ic_launcher_foreground.png")
    logo.resize((size, size), Image.LANCZOS).save(out, "PNG", optimize=True)
    print("foreground", density, size, os.path.getsize(out), "B")

print("done")
