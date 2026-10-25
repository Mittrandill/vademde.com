# Kullanım: python scan_tr.py <dosya|klasör> ...  — yorumlar dışında kalan, Türkçe olabilecek metinleri listeler.
# Türkçe karakter VEYA yaygın Türkçe kelime içeren string/JSX metinlerini yakalar.
import os, re, sys

TR_CHARS = re.compile(r'[çğıöşüÇĞİÖŞÜ]')
TR_WORDS = re.compile(r'\b(ve|ile|bir|için|veya|Kaydet|Sil|Tamam|Vazgeç|Devam|Hesap|Tutar|Tarih|Kayıt|Borç|Alacak|Gelir|Gider|Ekle|Yeni|Toplam|Kalan|Vade|Ödeme|Seç|Kapat|Düzenle|Tümü|Yok|Var|Kasa|Banka|Kart|Kredi|Fatura|Çek|Senet|Cari|Kategori|Rapor|Ayarlar|Profil|Abonelik|Plan|Hata|Başarılı|Lütfen|Henüz|Sonra|Önce|Bugün|Yarın|Dün|Hafta|Ay|Yıl|Gün|adet|tane|Not|Açıklama|Bilgi|Uyarı)\b')
IGNORE_LINE = re.compile(r"^\s*(//|\*|/\*)")

def strip_comments(line):
    # satır sonu yorumunu at (string içindeki // nadir; kaba ama yeterli)
    idx = line.find(' // ')
    return line if idx < 0 else line[:idx]

def scan(path):
    hits = []
    in_block = False
    for n, line in enumerate(open(path, encoding='utf8'), 1):
        s = line.rstrip('\n')
        if in_block:
            if '*/' in s:
                in_block = False
            continue
        if s.strip().startswith('/*') and '*/' not in s:
            in_block = True
            continue
        if IGNORE_LINE.match(s) or s.strip().startswith('{/*'):
            continue
        code = strip_comments(s)
        literals = re.findall(r"'([^'\\]*(?:\\.[^'\\]*)*)'|\"([^\"\\]*(?:\\.[^\"\\]*)*)\"|`([^`]*)`", code)
        texts = [a or b or c for a, b, c in literals]
        # JSX metin satırı (etiket dışı düz metin)
        stripped = code.strip()
        if stripped and not re.search(r"[=;(){}<>]|^import|^export|^const|^return|^if|^case", stripped) and re.search(r'[A-Za-zÇĞİÖŞÜçğıöşü]', stripped):
            texts.append(stripped)
        for m in re.findall(r'>([^<>{}]+)<', code):
            texts.append(m)
        for t in texts:
            if not t.strip():
                continue
            if t.startswith('@/') or t.startswith('./') or t.startswith('../'):
                continue
            if TR_CHARS.search(t) or TR_WORDS.search(t):
                hits.append((n, s.strip()[:160]))
                break
    return hits

paths = []
for arg in sys.argv[1:]:
    if os.path.isdir(arg):
        for root, _, files in os.walk(arg):
            paths += [os.path.join(root, f) for f in files if f.endswith(('.ts', '.tsx'))]
    else:
        paths.append(arg)
total = 0
for p in sorted(paths):
    hits = scan(p)
    if hits:
        total += len(hits)
        print(f'--- {p} ({len(hits)})')
        for n, s in hits:
            print(f'  {n}: {s}')
print(f'toplam {total}')
