#!/bin/zsh
# Vademde App Store v3 ekran görüntülerini headless Chrome ile üretir.
# Çıktı: out69 (6,9" 1320×2868), out65 (6,5" 1284×2778), out63 (6,3" 1206×2622; App Store Connect'in
# zorunlu "iPhone with Dynamic Island (medium display)" yuvası). Hepsi 6,9'dan türetilir.
# Dil: L=en ./render.sh → out69-en, out65-en, out63-en (yalnızca telefon dışındaki metinler çevrilir).
# Belirli slaytlar: ./render.sh 2 9
set -e
cd "${0:A:h}"
L=${L:-tr}; X=""; [[ $L == en ]] && X="-en"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p out69$X out65$X out63$X
list=($@); (( ${#list} )) || list=(1 2 3 4 5 6 7 8 9 10)
for i in $list; do
  n=$(printf "%02d" $i)
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1320,2868 --virtual-time-budget=3000 \
    --screenshot="$PWD/out69$X/vademde-$n.png" "file://$PWD/src/shots.html?s=$i&lang=$L" >/dev/null 2>&1
  echo "vademde-$n ($L)"
done
# Türetilen boyutlar + App Store: alfa kanalı olmamalı
X=$X python3 - <<'PY'
import glob, os
from PIL import Image
x = os.environ.get('X', '')
for p in sorted(glob.glob(f'out69{x}/vademde-*.png')):
    im = Image.open(p).convert('RGB'); im.save(p)
    name = os.path.basename(p)
    # 6,5": 1320→1284 ölçek (2790 yükseklik), alttan 12 px kırp
    im.resize((1284, 2790), Image.LANCZOS).crop((0, 0, 1284, 2778)).save(f'out65{x}/{name}')
    # 6,3": en-boy farkı %0,07, doğrudan ölçeklenir
    im.resize((1206, 2622), Image.LANCZOS).save(f'out63{x}/{name}')
PY
