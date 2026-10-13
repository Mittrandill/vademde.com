// Video zaman çizelgesi — hem animasyon (App.jsx) hem ses (audio.py, dist/timeline.json) buradan beslenir.
// 100 BPM: 1 vuruş = 0,6 sn; her sahne 4 vuruş.
export const FPS = 30;
export const BEAT = 0.6;
export const INTRO = 4 * BEAT;
export const SCENE = 4 * BEAT;
export const OUTRO = 8 * BEAT;

// box: ekran görüntüsünde (1206×2622) öne çıkarılacak bölge [x, y, w, h]
export const SCENES = [
  { shot: 'home', kicker: 'Ana sayfa', a: 'Bakiye, borç, alacak.', b: 'Tek bakışta.', pops: [{ box: [40, 460, 1126, 730] }] },
  { shot: 'tara', kicker: 'Akıllı belge okuma', a: 'Fotoğrafını çek.', b: 'Vademde okusun.', cheque: true },
  { shot: 'takvim', kicker: 'Vade takvimi', a: 'Hiçbir vade', b: 'sessizce geçmez.', notif: true },
  { shot: 'instruments', kicker: 'Çek ve senet', a: 'Portföyünüz', b: 'cebinizde.', pops: [{ box: [50, 1535, 1110, 200], ring: true }] },
  { shot: 'kredi', kicker: 'Krediler', a: 'Krediniz', b: 'taksit taksit.', pops: [{ box: [50, 650, 1106, 500] }, { box: [50, 2225, 1106, 200], ring: true }] },
  { shot: 'card', kicker: 'Kredi kartları', a: 'Limit, ekstre,', b: 'son ödeme.', pops: [{ box: [50, 650, 1106, 510], ring: true }] },
  { shot: 'cari', kicker: 'Cari hesaplar', a: 'Kim size borçlu,', b: 'kime borçlusunuz?', pops: [{ box: [50, 650, 1106, 520] }] },
  { shot: 'reports', kicker: 'Raporlar', a: 'Paranız', b: 'nereye gidiyor?', pops: [{ box: [60, 1015, 1086, 380] }] },
  { shot: 'banks', kicker: 'Bankalar', a: 'Tüm bankalarınız', b: 'tek ekranda.', pops: [{ box: [50, 560, 1106, 510] }, { box: [50, 1470, 1106, 200], ring: true }] },
];

export const sceneStart = (i) => INTRO + i * SCENE;
export const OUTRO_START = sceneStart(SCENES.length);
export const DURATION = OUTRO_START + OUTRO;

// Sahne içi olay zamanları (sahne başına göre)
export const POP_AT = [0.9, 1.5];
export const CHIP_AT = 1.2;

// Ses efektleri için olay listesi
export function audioEvents() {
  const ev = [{ t: 0.0, kind: 'riser' }, { t: 2 * BEAT, kind: 'impact' }];
  SCENES.forEach((s, i) => {
    const st = sceneStart(i);
    ev.push({ t: st, kind: 'whoosh' });
    (s.pops || []).forEach((_, k) => ev.push({ t: st + POP_AT[k], kind: 'pop' }));
    if (s.cheque) ev.push({ t: st + 0.75, kind: 'scan' }, { t: st + CHIP_AT + 0.3, kind: 'ding' });
    if (s.notif) ev.push({ t: st + CHIP_AT - 0.3, kind: 'ding' });
  });
  ev.push({ t: OUTRO_START, kind: 'whoosh' }, { t: OUTRO_START + 2 * BEAT, kind: 'impact' }, { t: OUTRO_START + 4 * BEAT, kind: 'pop' });
  return ev;
}
