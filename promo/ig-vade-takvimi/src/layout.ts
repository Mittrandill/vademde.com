// Tuval ve telefon ölçüleri. Ekran içi tüm koordinatlar ekran görüntülerinin 923x2000 uzayındadır
// (bkz. scripts/prepare-assets.py); telefon bu uzayı SCREEN_W genişliğe ölçekler.
export const CANVAS_W = 1080;
export const CANVAS_H = 1920;

export const SRC_W = 923;
export const SRC_H = 2000;

export const SCREEN_W = 660;
export const K = SCREEN_W / SRC_W;
export const SCREEN_H = SRC_H * K;
export const SCREEN_RADIUS = 92;
export const BEZEL = 16;
export const PHONE_X = (CANVAS_W - SCREEN_W) / 2;
export const PHONE_Y = 540;

/** Başlık metni Instagram'ın üst arayüzünün altında, telefonun üstünde kalır. */
export const HEADLINE_TOP = 238;

/** Inter'de line-height: 1 iken taban çizgisinin kutu üstünden uzaklığı (em). */
export const INTER_BASELINE = 0.863;
