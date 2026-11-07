"""Rebuild the pet skin sprites and js/pet-assets.js from a character sheet.

Usage (from the project root):
    python tools/build_pet_assets.py [sheet.png]

Default sheet: ../dsh-pet/assets/sheet.png
Writes: assets/pet-{front,side,back,happy}.png and js/pet-assets.js
"""
import base64
import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SHEET = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT.parent / "dsh-pet" / "assets" / "sheet.png"
ASSETS = ROOT / "assets"
JS = ROOT / "js" / "pet-assets.js"
BG = np.array([236, 242, 249])

# generous crop boxes in the original 1080x720 sheet
VIEWS = {
    "front": (58, 36, 340, 436),
    "side": (350, 36, 526, 436),
    "back": (552, 36, 806, 436),
    "happy": (800, 36, 1070, 446),
}


def background_connected(rgb):
    """True for pixels connected to the crop border through background-coloured pixels."""
    h, w = rgb.shape[:2]
    close = np.abs(rgb - BG).sum(axis=2) < 28
    seen = np.zeros((h, w), dtype=bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if close[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if close[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and close[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    return seen


def label(mask):
    """8-connected components: returns list of dicts {area, x0, x1, y0, y1, pix}."""
    h, w = mask.shape
    lab = np.zeros((h, w), dtype=np.int32)
    comps = []
    cur = 0
    for y, x in np.argwhere(mask):
        if lab[y, x]:
            continue
        cur += 1
        lab[y, x] = cur
        q = [(y, x)]
        pix = []
        x0 = x1 = x
        y0 = y1 = y
        while q:
            cy, cx = q.pop()
            pix.append((cy, cx))
            if cx < x0: x0 = cx
            if cx > x1: x1 = cx
            if cy < y0: y0 = cy
            if cy > y1: y1 = cy
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and lab[ny, nx] == 0:
                        lab[ny, nx] = cur
                        q.append((ny, nx))
        comps.append({"area": len(pix), "x0": x0, "x1": x1, "y0": y0, "y1": y1, "pix": pix})
    return comps


def main():
    if not SHEET.exists():
        raise SystemExit(f"sheet not found: {SHEET}")
    ASSETS.mkdir(parents=True, exist_ok=True)
    src = Image.open(SHEET).convert("RGB")
    data = {}
    for name, box in VIEWS.items():
        crop = src.crop(box)
        arr = np.array(crop).astype(int)
        bg = background_connected(arr)
        comps = label(~bg)
        comps.sort(key=lambda c: c["area"], reverse=True)
        if not comps:
            continue
        big = comps[0]
        main_mask = np.zeros(arr.shape[:2], dtype=bool)
        for (y, x) in big["pix"]:
            main_mask[y, x] = True
        dil = main_mask.copy()
        for _ in range(2):
            dil = dil | np.roll(dil, 1, 0) | np.roll(dil, -1, 0) | np.roll(dil, 1, 1) | np.roll(dil, -1, 1)
        keep = main_mask.copy()
        for c in comps[1:]:
            if c["area"] < 40:
                continue
            if any(dil[y, x] for (y, x) in c["pix"]):
                for (y, x) in c["pix"]:
                    keep[y, x] = True
        keep_pix = list(zip(*np.where(keep)))
        fg = np.zeros(arr.shape[:2], dtype=bool)
        for (y, x) in keep_pix:
            fg[y, x] = True

        # drop the baked ground shadow near the feet
        h, w = fg.shape
        for y in range(int(h * 0.8), h):
            for x in range(w):
                if not fg[y, x]:
                    continue
                r, g, b = arr[y, x]
                if b - r >= 12 and r > 170:
                    fg[y, x] = False

        rgba = np.array(crop.convert("RGBA"))
        rgba[:, :, 3] = np.where(fg, 255, 0).astype(np.uint8)
        img = Image.fromarray(rgba)
        img = img.crop(img.getbbox())
        target_h = 320
        target_w = round(img.width * target_h / img.height)
        img = img.resize((target_w, target_h), Image.LANCZOS)
        img.save(ASSETS / f"pet-{name}.png", optimize=True)
        data[name] = "data:image/png;base64," + base64.b64encode((ASSETS / f"pet-{name}.png").read_bytes()).decode()
        print(f"pet-{name}.png", img.size)

    js = "window.PR = window.PR || {};\nPR.petSpriteData = " + json.dumps(data, ensure_ascii=False) + ";\n"
    JS.write_text(js, encoding="utf-8")
    print("wrote", JS, len(js) // 1024, "KB")


if __name__ == "__main__":
    main()




