#!/usr/bin/env python3
import os
import re
import subprocess
import sys

BASE = "/sessions/brave-admiring-albattani/mnt/outputs/secret-garden"
FONTS_DIR = os.path.join(BASE, "web/fonts")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
CSS2_URL = ("https://fonts.googleapis.com/css2?"
            "family=DM+Sans:wght@400;500;600;700"
            "&family=Playfair+Display:ital,wght@0,500;0,600;1,500;1,600"
            "&display=swap")

os.makedirs(FONTS_DIR, exist_ok=True)


def curl(url, extra_args=None, out_path=None):
    args = ["curl", "-sL", "-H", "User-Agent: %s" % UA, url]
    if out_path:
        args += ["-o", out_path]
    if extra_args:
        args += extra_args
    result = subprocess.run(args, capture_output=not out_path, text=not out_path, check=True)
    return result.stdout if not out_path else None


def fetch_css2():
    args = ["curl", "-sL", "-H", "User-Agent: %s" % UA, CSS2_URL]
    result = subprocess.run(args, capture_output=True, text=True, check=True)
    return result.stdout


def parse_latin_blocks(css_text):
    pattern = re.compile(
        r"/\*\s*(?P<subset>[\w-]+)\s*\*/\s*"
        r"@font-face\s*\{(?P<body>[^}]*)\}",
        re.MULTILINE,
    )
    rows = []
    for m in pattern.finditer(css_text):
        if m.group("subset") != "latin":
            continue
        body = m.group("body")
        fam = re.search(r"font-family:\s*'([^']+)'", body).group(1)
        style = re.search(r"font-style:\s*(\w+)", body).group(1)
        weight = re.search(r"font-weight:\s*(\d+)", body).group(1)
        url = re.search(r"url\(([^)]+)\)", body).group(1)
        rows.append({"family": fam, "style": style, "weight": weight, "url": url})
    return rows


def local_name(family, weight, style):
    stem = "dm-sans" if family == "DM Sans" else "playfair"
    parts = [stem, weight]
    if style == "italic":
        parts.append("italic")
    return "-".join(parts) + ".woff2"


def main():
    css_text = fetch_css2()
    if "woff2" not in css_text:
        print("ERROR: css2 response did not contain woff2 references", file=sys.stderr)
        sys.exit(1)

    rows = parse_latin_blocks(css_text)
    if len(rows) != 8:
        print("WARNING: expected 8 latin blocks (4 DM Sans + 4 Playfair), got %d" % len(rows))

    unique_urls = sorted(set(r["url"] for r in rows))
    print("unique remote woff2 files: %d" % len(unique_urls))

    cache = {}
    for i, url in enumerate(unique_urls):
        tmp_path = "/tmp/_font_src_%d.woff2" % i
        curl(url, out_path=tmp_path)
        with open(tmp_path, "rb") as f:
            data = f.read()
        if not data.startswith(b"wOF2"):
            print("ERROR: downloaded file is not woff2 signature: %s" % url, file=sys.stderr)
            sys.exit(1)
        cache[url] = data
        print("fetched", url, len(data), "bytes")

    face_rules = []
    written_files = []
    for r in rows:
        fname = local_name(r["family"], r["weight"], r["style"])
        out_path = os.path.join(FONTS_DIR, fname)
        with open(out_path, "wb") as f:
            f.write(cache[r["url"]])
        written_files.append((fname, len(cache[r["url"]])))
        face_rules.append(
            "@font-face {\n"
            "  font-family: '%s';\n"
            "  font-style: %s;\n"
            "  font-weight: %s;\n"
            "  font-display: swap;\n"
            "  src: url('./%s') format('woff2');\n"
            "}\n" % (r["family"], r["style"], r["weight"], fname)
        )

    css_out = "\n".join(face_rules)
    css_path = os.path.join(FONTS_DIR, "fonts.css")
    with open(css_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(css_out)

    print()
    print("wrote", css_path)
    for fname, size in written_files:
        print("  %-28s %6d bytes" % (fname, size))


if __name__ == "__main__":
    main()
