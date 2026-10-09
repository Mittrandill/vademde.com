#!/usr/bin/env bash
# Vademde Google Play v3 görsellerini headless Chrome ile üretir (kaynak: src/play.html).
# Çıktı: play/ (tr) ya da play-en/ (L=en ./render-play.sh)
#   vademde-01..10.png  telefon ekran görüntüleri, 1440×2560 (9:16; Play sınırı: uzun kenar ≤ 2 × kısa kenar)
#   feature.png         kapak görseli (feature graphic), 1024×500 — 2x render edilip küçültülür
# Belirli slaytlar: ./render-play.sh 2 9   (kapak yalnızca argümansız çalıştırmada üretilir)
# Play: 24 bit PNG, alfa kanalı yok.
set -e
cd "$(dirname "$0")"
L=${L:-tr}; X=""; [[ $L == en ]] && X="-en"
CHROME=${CHROME:-}
for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
         "/c/Program Files/Google/Chrome/Application/chrome.exe" \
         "/c/Program Files (x86)/Google/Chrome/Application/chrome.exe"; do
  [[ -z $CHROME && -x $c ]] && CHROME=$c
done
[[ -n $CHROME ]] || { echo "Chrome bulunamadı (CHROME=... ile verin)"; exit 1; }
OUT="play$X"; mkdir -p "$OUT"
# Chrome dosya yolunu kendi biçiminde ister (Windows'ta C:/..., macOS'ta /...).
SRC="$(cd src && (pwd -W 2>/dev/null || pwd))"
shot() { # çıktı genişlik yükseklik ölçek sorgu
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=$4 \
    --window-size=$2,$3 --virtual-time-budget=6000 \
    --screenshot="$(cd "$OUT" && (pwd -W 2>/dev/null || pwd))/$1" "file:///${SRC#/}/play.html?$5&lang=$L" >/dev/null 2>&1
}
list=("$@"); (( ${#list[@]} )) || list=(1 2 3 4 5 6 7 8 9 10)
for i in "${list[@]}"; do
  n=$(printf "%02d" "$i")
  shot "vademde-$n.png" 1440 2560 1 "s=$i"
  echo "vademde-$n ($L)"
done
if (( $# == 0 )); then
  shot feature@2x.png 1024 500 2 "c=feature"
  echo "feature ($L)"
fi
OUT="$OUT" python - <<'PY'
import glob, os
from PIL import Image
out = os.environ['OUT']
for p in glob.glob(f'{out}/vademde-*.png'):
    Image.open(p).convert('RGB').save(p)
big = f'{out}/feature@2x.png'
if os.path.exists(big):
    Image.open(big).convert('RGB').resize((1024, 500), Image.LANCZOS).save(f'{out}/feature.png')
    os.remove(big)
PY
