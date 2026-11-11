#!/bin/zsh
# App Store Retention Message görseli (yazısız, tüm dillerde ortak). Çıktı: creative/retention.png 3840×2160, alfasız.
set -e; cd "${0:A:h}"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=3840,2160 --virtual-time-budget=3000 \
  --screenshot="$PWD/creative/retention.png" "file://$PWD/src/retention.html" >/dev/null 2>&1
python3 -c "from PIL import Image; Image.open('creative/retention.png').convert('RGB').save('creative/retention.png')"
