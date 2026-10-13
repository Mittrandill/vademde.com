// Chromium başlatıcı: CHROME_PATH > bulut ortamındaki headless_shell > Playwright'ın kendi Chromium'u
// (Mac'te ilk seferde: npx playwright install chromium)
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';

const candidates = [process.env.CHROME_PATH, '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
export const launch = () => chromium.launch({ executablePath: candidates.find((p) => p && existsSync(p)) });
