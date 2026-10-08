const fs = require('fs');
const path = require('path');

// Widget'taki banka logoları: uygulamadaki assets/bank-icons ile aynı dosyalar, "bank_<kod>" adıyla
// (Swift: UIImage(named: "bank_akbank")). Kod, features/banks/banks.ts'teki bank_code'dur.
const bankIconsDir = path.join(__dirname, '../../assets/bank-icons');
const bankImages = Object.fromEntries(
  fs
    .readdirSync(bankIconsDir)
    .filter((file) => file.endsWith('.png'))
    .map((file) => [`bank_${path.basename(file, '.png')}`, `../../assets/bank-icons/${file}`])
);

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: 'widget',
  name: 'VademdeWidget',
  displayName: 'Vademde',
  icon: '../../assets/icon.png',
  bundleIdentifier: '.widget',
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'WidgetKit'],
  // Widget'lar her zaman koyu (tuval WidgetAnaEkran, koyu tema).
  colors: {
    $accent: '#FFB000',
    $widgetBackground: '#2B2D31',
  },
  images: {
    vademdeMark: '../../assets/icon.png',
    ...bankImages,
  },
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
