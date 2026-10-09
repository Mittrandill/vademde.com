#!/bin/zsh
# iOS 27 Header / Search Results görselleri: yarım ölçekli tuvali 2x cihaz ölçeğiyle tam boyuta render eder.
set -e
cd "${0:A:h}"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
mkdir -p creative
render() { # ad genişlik yükseklik
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --window-size=$2,$3 --virtual-time-budget=3000 \
    --screenshot="$PWD/creative/$1.png" "file://$PWD/src/creative.html?c=$1" >/dev/null 2>&1
  echo $1
}
render header 1920 823
render search 1920 1280
render universal 2622 1475
# Apple: alfa kanalı olmamalı
python3 -c "
from PIL import Image; import glob
for p in glob.glob('creative/*.png'): Image.open(p).convert('RGB').save(p)"
