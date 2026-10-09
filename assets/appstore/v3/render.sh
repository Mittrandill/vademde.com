#!/bin/zsh
# Vademde App Store v3 ekran görüntülerini headless Chrome ile üretir.
# Çıktı: out69/ (6,9" 1320×2868) ve out65/ (6,5" 1284×2778, 6,9'dan ölçeklenip kırpılır).
set -e
cd "${0:A:h}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p out69 out65
list=($@); (( ${#list} )) || list=(1 2 3 4 5 6 7 8 9 10)
for i in $list; do
  n=$(printf "%02d" $i)
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1320,2868 --virtual-time-budget=3000 \
    --screenshot="$PWD/out69/vademde-$n.png" "file://$PWD/src/shots.html?s=$i" >/dev/null 2>&1
  # 6,5": 1320→1284 ölçek (2790 yükseklik), alttan 12 px kırp
  sips -z 2790 1284 out69/vademde-$n.png --out out65/vademde-$n.png >/dev/null
  sips -c 2778 1284 --cropOffset 0 0 out65/vademde-$n.png >/dev/null
  echo "vademde-$n"
done
# App Store: alfa kanalı olmamalı
python3 -c "
from PIL import Image; import glob
for p in glob.glob('out6*/vademde-*.png'): Image.open(p).convert('RGB').save(p)"
