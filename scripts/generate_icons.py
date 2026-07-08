#!/usr/bin/env python3
import math
import os
from PIL import Image, ImageDraw, ImageFilter

BASE = "/sessions/brave-admiring-albattani/mnt/outputs/secret-garden"

# Exact tokens from docs/styles.css (preferred over prompt samples where they differ)
SAGE = "#E9F0E2"        # --paper-2, misty sage
INK = "#22331B"         # --ink, deep forest ink
HONEY = "#B4894D"       # --honey
HONEY_DEEP = "#9A7636"  # --honey-deep
HONEY_LIGHT = "#D8B26A" # --honey-light
LEAF_DEEP = "#2F5233"   # --leaf-deep
LEAF = "#5B8C5A"        # --leaf

STANDARD_PAD = 0.11   # ~78% emblem diameter, standard web icons
MASK_PAD = 0.17        # exactly 66% emblem diameter, maskable safe zone
LEGACY_PAD = 0.09      # ~82% emblem diameter, legacy android launcher
FOREGROUND_PAD = 0.20  # exactly 60% emblem diameter, adaptive foreground
SPLASH_PAD = 0.25      # 50% emblem diameter, generous padding for splash


def hx(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def lerp(a, b, t):
    return a + (b - a) * t


def lerp_color(c0, c1, t):
    return tuple(int(round(lerp(c0[i], c1[i], t))) for i in range(4))


def multi_stop_color(stops, t):
    if t <= stops[0][0]:
        return stops[0][1]
    if t >= stops[-1][0]:
        return stops[-1][1]
    for i in range(len(stops) - 1):
        f0, c0 = stops[i]
        f1, c1 = stops[i + 1]
        if f0 <= t <= f1:
            lt = 0.0 if f1 == f0 else (t - f0) / (f1 - f0)
            return lerp_color(c0, c1, lt)
    return stops[-1][1]


def petal_points(cx, cy, angle_deg, r_offset, length, width, n=48):
    theta = math.radians(angle_deg)
    ct, st = math.cos(theta), math.sin(theta)
    right = []
    left = []
    for i in range(n + 1):
        t = i / n
        tt = t ** 0.92
        w = width * (math.sin(math.pi * tt) ** 0.80)
        u = r_offset + t * length
        v = w / 2.0
        right.append((cx + u * ct - v * st, cy + u * st + v * ct))
        left.append((cx + u * ct + v * st, cy + u * st - v * ct))
    return right + left[::-1]


def draw_rosette(canvas, cx, cy, R):
    draw = ImageDraw.Draw(canvas)
    outer_color = hx(LEAF_DEEP) + (255,)
    inner_color = hx(LEAF) + (255,)
    outer_angles = [-90 + i * 60 for i in range(6)]
    inner_angles = [-90 + 30 + i * 60 for i in range(6)]

    for a in outer_angles:
        pts = petal_points(cx, cy, a, R * 0.10, R * 0.90, R * 0.90 * 0.50)
        draw.polygon(pts, fill=outer_color)
    for a in inner_angles:
        pts = petal_points(cx, cy, a, R * 0.06, R * 0.60, R * 0.60 * 0.54)
        draw.polygon(pts, fill=inner_color)

    glow_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow_layer)
    glow_r = R * 0.46
    gdraw.ellipse([cx - glow_r, cy - glow_r, cx + glow_r, cy + glow_r], fill=hx(HONEY_LIGHT) + (190,))
    blur_px = max(1.0, R * 0.20)
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(blur_px))
    canvas.alpha_composite(glow_layer)

    draw = ImageDraw.Draw(canvas)
    core_r = R * 0.22
    steps = 48
    stops = [(0.0, hx(HONEY_LIGHT) + (255,)), (0.6, hx(HONEY) + (255,)), (1.0, hx(HONEY_DEEP) + (255,))]
    for i in range(steps, 0, -1):
        t = i / steps
        col = multi_stop_color(stops, t)
        r = t * core_r
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=col)


def draw_emblem_icon(size, pad_frac, bg=None, bg_shape="square", corner_frac=0.19, rim=False, ss=4):
    ws = size * ss
    canvas = Image.new("RGBA", (ws, ws), (0, 0, 0, 0))
    if bg is not None:
        draw = ImageDraw.Draw(canvas)
        col = hx(bg) + (255,)
        rim_col = hx(INK) + (40,)
        rim_w = max(1, int(ws * 0.006))
        if bg_shape == "square":
            draw.rectangle([0, 0, ws - 1, ws - 1], fill=col)
        elif bg_shape == "circle":
            if rim:
                draw.ellipse([0, 0, ws - 1, ws - 1], fill=col, outline=rim_col, width=rim_w)
            else:
                draw.ellipse([0, 0, ws - 1, ws - 1], fill=col)
        elif bg_shape == "rounded":
            r = int(ws * corner_frac)
            if rim:
                draw.rounded_rectangle([0, 0, ws - 1, ws - 1], radius=r, fill=col, outline=rim_col, width=rim_w)
            else:
                draw.rounded_rectangle([0, 0, ws - 1, ws - 1], radius=r, fill=col)
    pad = ws * pad_frac
    cx = cy = ws / 2.0
    R = (ws - 2 * pad) / 2.0
    draw_rosette(canvas, cx, cy, R)
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
