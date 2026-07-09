#!/usr/bin/env python3
import os
from PIL import Image

BASE = "/sessions/brave-admiring-albattani/mnt/outputs/secret-garden"

EXPECTED = [
    ("web/icons/favicon.png", 64, 64),
    ("web/icons/icon-192.png", 192, 192),
    ("web/icons/icon-512.png", 512, 512),
    ("web/icons/icon-maskable-512.png", 512, 512),
    ("web/icons/apple-touch-icon.png", 180, 180),

    ("android/app/src/main/res/mipmap-mdpi/ic_launcher.png", 48, 48),
    ("android/app/src/main/res/mipmap-mdpi/ic_launcher_round.png", 48, 48),
    ("android/app/src/main/res/mipmap-mdpi/ic_launcher_foreground.png", 108, 108),

    ("android/app/src/main/res/mipmap-hdpi/ic_launcher.png", 72, 72),
    ("android/app/src/main/res/mipmap-hdpi/ic_launcher_round.png", 72, 72),
    ("android/app/src/main/res/mipmap-hdpi/ic_launcher_foreground.png", 162, 162),

    ("android/app/src/main/res/mipmap-xhdpi/ic_launcher.png", 96, 96),
    ("android/app/src/main/res/mipmap-xhdpi/ic_launcher_round.png", 96, 96),
    ("android/app/src/main/res/mipmap-xhdpi/ic_launcher_foreground.png", 216, 216),

    ("android/app/src/main/res/mipmap-xxhdpi/ic_launcher.png", 144, 144),
    ("android/app/src/main/res/mipmap-xxhdpi/ic_launcher_round.png", 144, 144),
    ("android/app/src/main/res/mipmap-xxhdpi/ic_launcher_foreground.png", 324, 324),

    ("android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png", 192, 192),
    ("android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_round.png", 192, 192),
    ("android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png", 432, 432),

    ("android/app/src/main/res/drawable/ic_splash_logo.png", 288, 288),
]

SQUARE_BG = {
    "web/icons/favicon.png", "web/icons/icon-192.png", "web/icons/icon-512.png",
    "web/icons/icon-maskable-512.png", "web/icons/apple-touch-icon.png",
}
SHAPED_BG = set()
for density in ("mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"):
    SHAPED_BG.add("android/app/src/main/res/mipmap-%s/ic_launcher.png" % density)
    SHAPED_BG.add("android/app/src/main/res/mipmap-%s/ic_launcher_round.png" % density)

TRANSPARENT_CANVAS = set(rel for rel, _, _ in EXPECTED) - SQUARE_BG - SHAPED_BG

fail = False
print("%-78s %10s %6s  %s" % ("path", "size", "mode", "status"))
for rel, ew, eh in EXPECTED:
    path = os.path.join(BASE, rel)
    if not os.path.exists(path):
        print("%-78s %10s %6s  MISSING" % (rel, "-", "-"))
        fail = True
        continue
    with Image.open(path) as im:
        im.load()
        w, h = im.size
        mode = im.mode
        ok = (w == ew and h == eh)
        status = "OK" if ok else "SIZE MISMATCH (expected %dx%d)" % (ew, eh)
        if not ok:
            fail = True

        if mode == "RGBA":
            corner_alpha = im.getpixel((0, 0))[3]
            if rel in SQUARE_BG and corner_alpha < 250:
                status += " | WARN corner not opaque (a=%d)" % corner_alpha
                fail = True
            elif rel in TRANSPARENT_CANVAS and corner_alpha != 0:
                status += " | WARN corner not transparent (a=%d)" % corner_alpha
                fail = True
            elif rel in SHAPED_BG:
                top_center = im.getpixel((w // 2, max(1, int(h * 0.08))))[3]
                shaped_ok = True
                if corner_alpha != 0:
                    status += " | WARN true corner not transparent (a=%d)" % corner_alpha
                    fail = True
                    shaped_ok = False
                if top_center < 250:
                    status += " | WARN shape interior not opaque (a=%d)" % top_center
                    fail = True
                    shaped_ok = False
                if shaped_ok:
                    status += " | shaped-bg corner transparent + interior opaque as designed"
        elif mode == "RGB" and rel in (TRANSPARENT_CANVAS | SHAPED_BG):
            status += " | WARN expected alpha channel, got RGB"
            fail = True

        print("%-78s %10s %6s  %s" % (rel, "%dx%d" % (w, h), mode, status))

print()
print("PROBE RESULT:", "FAIL" if fail else "PASS", "-", len(EXPECTED), "files checked")
