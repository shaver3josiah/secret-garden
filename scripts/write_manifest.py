#!/usr/bin/env python3
import json
import os

BASE = "/sessions/brave-admiring-albattani/mnt/outputs/secret-garden"

manifest = {
    "name": "Secret Garden",
    "short_name": "Secret Garden",
    "description": "A living garden that breathes with real weather, sky, and the moon, with scripture at its heart.",
    "start_url": "./",
    "scope": "./",
    "display": "standalone",
    "orientation": "any",
    "background_color": "#E9F0E2",
    "theme_color": "#E9F0E2",
    "icons": [
        {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {"src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}
    ]
}

out_path = os.path.join(BASE, "web/manifest.webmanifest")
with open(out_path, "w", encoding="utf-8", newline="\n") as f:
    json.dump(manifest, f, indent=2, ensure_ascii=True)
    f.write("\n")

print("wrote", out_path)
