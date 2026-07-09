#!/usr/bin/env python3
"""Generate every app icon from the Secret Garden mark.

The mark (a sailboat cradled in a ring of daisies) lives as vector art in
design/logo/mark.svg. design/logo/mark-master.png is that SVG rendered to a
1024px transparent raster (see scripts/render_master.py). This script composites
the master onto the per-slot backgrounds/paddings the web and Android targets need.
"""
import os
from PIL import Image

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # repo root
MASTER_PATH = os.path.join(BASE, "design", "logo", "mark-master.png")

SAGE = "#E9F0E2"  # --paper-2, misty sage — icon/adaptive background
INK = "#22331B"   # --ink, deep forest ink — hairline rim

STANDARD_PAD = 0.11   # ~78% emblem diameter, standard web icons
MASK_PAD = 0.17       # 66% emblem diameter, maskable safe zone
LEGACY_PAD = 0.09     # ~82% emblem diameter, legacy android launcher
FOREGROUND_PAD = 0.20 # 60% emblem diameter, adaptive foreground
SPLASH_PAD = 0.25     # 50% emblem diameter, generous splash padding


def hx(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def load_emblem():
    """Master cropped to its alpha bounds and padded to a centered square,
    so the emblem fills the square edge to edge and the paddings below behave."""
    im = Image.open(MASTER_PATH).convert("RGBA")
    bbox = im.getbbox()
    if bbox:
        im = im.crop(bbox)
    side = max(im.size)
    sq = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    sq.alpha_composite(im, ((side - im.width) // 2, (side - im.height) // 2))
    return sq


EMBLEM = load_emblem()


def draw_emblem_icon(size, pad_frac, bg=None, bg_shape="square", corner_frac=0.19, rim=False, ss=4):
    ws = size * ss
    canvas = Image.new("RGBA", (ws, ws), (0, 0, 0, 0))
    if bg is not None:
        from PIL import ImageDraw
        draw = ImageDraw.Draw(canvas)
        col = hx(bg) + (255,)
        rim_col = hx(INK) + (40,)
        rim_w = max(1, int(ws * 0.006))
        if bg_shape == "square":
            draw.rectangle([0, 0, ws - 1, ws - 1], fill=col)
        elif bg_shape == "circle":
            draw.ellipse([0, 0, ws - 1, ws - 1], fill=col,
                         outline=rim_col if rim else None, width=rim_w)
        elif bg_shape == "rounded":
            r = int(ws * corner_frac)
            draw.rounded_rectangle([0, 0, ws - 1, ws - 1], radius=r, fill=col,
                                   outline=rim_col if rim else None, width=rim_w)
    pad = ws * pad_frac
    d = int(round(ws - 2 * pad))  # emblem diameter
    emblem = EMBLEM.resize((d, d), Image.Resampling.LANCZOS)
    off = (ws - d) // 2
    canvas.alpha_composite(emblem, (off, off))
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def save(img, relpath):
    path = os.path.join(BASE, relpath)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.save(path, "PNG")
    print("wrote", relpath, img.size, img.mode)


def main():
    save(draw_emblem_icon(64, STANDARD_PAD, SAGE, "square"), "web/icons/favicon.png")
    save(draw_emblem_icon(192, STANDARD_PAD, SAGE, "square"), "web/icons/icon-192.png")
    save(draw_emblem_icon(512, STANDARD_PAD, SAGE, "square"), "web/icons/icon-512.png")
    save(draw_emblem_icon(512, MASK_PAD, SAGE, "square"), "web/icons/icon-maskable-512.png")
    apple = draw_emblem_icon(180, STANDARD_PAD, SAGE, "square").convert("RGB")
    save(apple, "web/icons/apple-touch-icon.png")

    density_map = [
        ("mdpi", 48, 108),
        ("hdpi", 72, 162),
        ("xhdpi", 96, 216),
        ("xxhdpi", 144, 324),
        ("xxxhdpi", 192, 432),
    ]
    for density, legacy_size, fg_size in density_map:
        p = "android/app/src/main/res/mipmap-%s/" % density
        save(draw_emblem_icon(legacy_size, LEGACY_PAD, SAGE, "rounded", corner_frac=0.19, rim=True), p + "ic_launcher.png")
        save(draw_emblem_icon(legacy_size, LEGACY_PAD, SAGE, "circle", rim=True), p + "ic_launcher_round.png")
        save(draw_emblem_icon(fg_size, FOREGROUND_PAD, None, "square"), p + "ic_launcher_foreground.png")

    splash = draw_emblem_icon(288, SPLASH_PAD, None, "square")
    save(splash, "android/app/src/main/res/drawable/ic_splash_logo.png")

    adaptive_xml = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
        '    <background android:drawable="@color/ic_launcher_background"/>\n'
        '    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n'
        '</adaptive-icon>\n'
    )
    anydpi_dir = os.path.join(BASE, "android/app/src/main/res/mipmap-anydpi-v26")
    os.makedirs(anydpi_dir, exist_ok=True)
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        with open(os.path.join(anydpi_dir, name), "w", encoding="utf-8", newline="\n") as f:
            f.write(adaptive_xml)
        print("wrote android/app/src/main/res/mipmap-anydpi-v26/" + name)

    color_xml = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        '<resources>\n'
        '    <color name="ic_launcher_background">#E9F0E2</color>\n'
        '</resources>\n'
    )
    values_dir = os.path.join(BASE, "android/app/src/main/res/values")
    os.makedirs(values_dir, exist_ok=True)
    with open(os.path.join(values_dir, "ic_launcher_background.xml"), "w", encoding="utf-8", newline="\n") as f:
        f.write(color_xml)
    print("wrote android/app/src/main/res/values/ic_launcher_background.xml")


if __name__ == "__main__":
    main()
