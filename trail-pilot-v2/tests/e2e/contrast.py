"""Contraste des textes du bloc « Ma sortie du jour », mesuré sur le rendu réel.

Lance d'abord `npm run test:e2e -- night` : il enregistre les captures sans texte (*-fond.png) et la position
de chaque texte (night-boxes.json). Pour chaque texte, on prend le fond réellement affiché derrière lui
(95e centile de luminance, le cas le plus clair hors pixels isolés), on y compose la couleur du texte
(blanc plus ou moins transparent) et on calcule le contraste WCAG.
Seuils : 4,5:1 pour le texte courant, 3:1 pour le grand texte (24 px et plus, ou 18,7 px et plus en gras).

    python3 tests/e2e/contrast.py
"""
import json, os, re, sys
from PIL import Image

HERE = os.path.join(os.path.dirname(__file__), ".tmp")

def lin(c):
    c = c / 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def lum(rgb):
    r, g, b = rgb[:3]
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)

def parse(color):
    # « rgb(255, 128, 0) » (0 à 255) ou « color(srgb 1 0.5 0) » (0 à 1, produit par color-mix).
    v = [float(x) for x in re.findall(r"[\d.]+", color)]
    if color.startswith("color("):
        rgb = [x * 255 for x in v[:3]]
        return rgb, (v[3] if len(v) > 3 else 1.0)
    return v[:3], (v[3] if len(v) > 3 else 1.0)

QUIET = "-q" in sys.argv
ARGS = [a for a in sys.argv[1:] if not a.startswith("-")]
PREFIX = "tour-" if ARGS and ARGS[0].startswith("tour") else "night-"
worst_fail = 0
for key, boxes in json.load(open(os.path.join(HERE, ARGS[0] if ARGS else "night-boxes.json"))).items():
    img = Image.open(os.path.join(HERE, f"{PREFIX}{key}-fond.png")).convert("RGB")
    root = boxes[0]
    scale = img.width / root["w"]
    print(f"\n{key} (×{scale:.0f})")
    for b in boxes[1:]:
        x0, y0 = int(b["x"] * scale), int(b["y"] * scale)
        x1, y1 = int((b["x"] + b["w"]) * scale), int((b["y"] + b["h"]) * scale)
        px = [img.getpixel((x, y)) for x in range(max(0, x0), min(img.width, x1), max(1, int(scale))) for y in range(max(0, y0), min(img.height, y1), max(1, int(scale)))]
        if not px:
            continue
        px.sort(key=lum)
        bg = px[int(len(px) * 0.95) - 1 if len(px) > 1 else 0]
        rgb, a = parse(b["color"])
        txt = [a * rgb[i] + (1 - a) * bg[i] for i in range(3)]
        l1, l2 = lum(txt), lum(bg)
        ratio = (max(l1, l2) + 0.05) / (min(l1, l2) + 0.05)
        large = b["size"] >= 24 or (b["size"] >= 18.66 and b.get("weight", 400) >= 700)
        need = 3.0 if large else 4.5
        ok = ratio >= need
        if not ok:
            worst_fail += 1
        if ok and QUIET:
            continue
        print(f"  {'✓' if ok else '✗'} {ratio:4.1f}:1 (min {need}) {b['size']:.0f}px {b['sel'][:22]:<22} « {b['text'][:28]} »")

print(f"\n{'Tous les textes atteignent leur seuil.' if not worst_fail else f'{worst_fail} texte(s) sous le seuil.'}")
sys.exit(1 if worst_fail else 0)
