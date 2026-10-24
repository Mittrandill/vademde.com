"""Ekran görüntülerini video için hazırlar.

Girdi: kullanıcının gönderdiği iPhone ekranları (923x2000) ve App Store çekimlerindeki
tarama / OCR onay ekranları (1206x2622). Hepsi 923 genişliğe indirilir; video tarafı tüm
koordinatları bu 923x2000 uzayında verir (bkz. src/layout.ts).

Kullanım: python3 scripts/prepare-assets.py <kullanici-ekranlari-klasoru>
Klasörde 3.webp (ana ekran), 4.webp (takvim, kaydırılmış), 5.webp (takvim, hafta) olmalı.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parents[1]
OUT = ROOT / "assets" / "screens"
BRAND = ROOT / "assets" / "brand"
W, H = 923, 2000

# 4.webp'deki satır y, 5.webp'deki satır y + SCROLL ile aynı içeriği gösterir (korelasyonla ölçüldü).
SCROLL = 491
TALL_SPLIT = 1750  # 5.webp bu satıra kadar (FAB'ın üstü kalmasın), sonrası 4.webp'den gelir
TABBAR_TOP = 1795
FAB = (461, 1836, 70)  # merkez x, y, yarıçap


def load(path):
    return Image.open(path).convert("RGB")


def to_923(img):
    w, h = img.size
    img = img.resize((W, round(h * W / w)), Image.LANCZOS)
    return img.crop((0, 0, W, H))


def erase_rows(img, x0, x1, y0, y1):
    """Metni sil: her satırı sol ve sağ kenar pikselleri arasında doğrusal doldur."""
    a = np.asarray(img).astype(float).copy()
    t = np.linspace(0, 1, x1 - x0)[None, :, None]
    left = a[y0:y1, x0 - 2 : x0 - 1]
    right = a[y0:y1, x1 + 1 : x1 + 2]
    a[y0:y1, x0:x1] = left * (1 - t) + right * t
    return Image.fromarray(a.clip(0, 255).astype("uint8"))


def main(src_dir):
    src = Path(src_dir)
    OUT.mkdir(parents=True, exist_ok=True)
    BRAND.mkdir(parents=True, exist_ok=True)

    s3, s4, s5 = (load(src / f"{i}.webp") for i in (3, 4, 5))

    # Takvim: hafta ekranı + kaydırınca görünen banka kartları tek uzun sayfa.
    top = s5.crop((0, 0, W, TALL_SPLIT))
    rest = s4.crop((0, TALL_SPLIT - SCROLL, W, TABBAR_TOP))
    tall = Image.new("RGB", (W, top.height + rest.height))
    tall.paste(top, (0, 0))
    tall.paste(rest, (0, top.height))
    tall.save(OUT / "takvim-tall.png")

    # Sekme çubuğu sabit kalır; içerik arkasından kayar.
    s4.crop((0, TABBAR_TOP, W, H)).save(OUT / "tabbar.png")
    cx, cy, r = FAB
    fab = s4.crop((cx - r, cy - r, cx + r, cy + r)).convert("RGBA")
    mask = Image.new("L", fab.size, 0)
    ImageDraw.Draw(mask).ellipse((0, 0, 2 * r - 1, 2 * r - 1), fill=255)
    fab.putalpha(mask)
    fab.save(OUT / "fab.png")

    # Ana ekran: sayaçla yeniden yazılacak tutarlar silinmiş zemin + orijinal.
    s3.save(OUT / "home.png")
    # ",79" cüzdan görselinin üstünde; o kısım sabit kalır, yalnızca tam kısım sayar.
    erased = erase_rows(s3, 92, 512, 500, 592)
    erased = erase_rows(erased, 92, 400, 812, 868)
    erased = erase_rows(erased, 478, 830, 812, 868)
    erased.save(OUT / "home-erased.png")

    shots = REPO / "assets" / "appstore" / "v3" / "src" / "shots"
    to_923(load(shots / "tara.png")).save(OUT / "tara.png")
    to_923(load(shots / "rev_kredi.png")).save(OUT / "rev.png")

    logo = REPO / "Vademde_Tam_Logo_Paketi_v2.0" / "01_Ana_Logo" / "Wordmark"
    # Beyaz wordmark grafit zemin üzerinde gelir; zemini saydamlığa çevir (parlaklık = alfa).
    wm = np.asarray(Image.open(logo / "vademde-wordmark-beyaz-1100px.png").convert("RGB")).astype(float)
    bg = wm[2, 2]
    alpha = ((wm - bg).max(axis=2) / (255 - bg.min())).clip(0, 1)
    rgba = np.dstack([np.full(alpha.shape + (3,), 255.0), alpha * 255]).astype("uint8")
    Image.fromarray(rgba, "RGBA").save(BRAND / "wordmark.png")
    Image.open(REPO / "assets" / "icon.png").resize(
        (512, 512), Image.LANCZOS
    ).save(BRAND / "icon.png")
    print("ok:", sorted(p.name for p in OUT.iterdir()))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else ROOT / "assets" / "source")
