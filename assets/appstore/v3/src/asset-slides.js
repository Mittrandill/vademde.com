// New release artwork uses complete native app captures in both languages.
(() => {
  const params = new URLSearchParams(location.search);
  const english = params.get('lang') === 'en';
  const android = location.pathname.endsWith('/play.html');
  const base = android ? (english ? 'shots-en-android' : 'shots-tr-android') : (english ? 'shots-en' : 'shots');
  if (android && Number(params.get('s')) >= 11) document.documentElement.classList.add('native-android');
  const copy = english ? [
    ['My Assets', 'Your property.<br>Your vehicles.<br><em>One place.</em>', 'Record your own estimated values and ownership shares. Keep your assets in view.', 'assets'],
    ['Every asset, in detail', 'Know its value.<br><em>Follow its costs.</em>', 'Link fuel, insurance, rent and loan records. Review each asset’s details and value history.', 'asset-detail'],
  ] : [
    ['Varlıklarım', 'Evin, arsan,<br>aracın.<br><em>Tek yerde.</em>', 'Tahmini değerlerini ve sahiplik payını kendin gir. Varlıklarını birlikte takip et.', 'assets'],
    ['Varlığının ayrıntıları', 'Değerini bil.<br><em>Giderini izle.</em>', 'Yakıt, sigorta, kira ve kredi kayıtlarını ilişkilendir. Varlık bilgilerini ve değer geçmişini gör.', 'asset-detail'],
  ];
  const deck = document.querySelector('.deck');
  for (const [label, title, description, file] of copy) {
    const slide = document.createElement('section');
    slide.className = 'slide asset-slide';
    slide.innerHTML = `<div class="copy"><div class="eyebrow"><i></i>${label}</div><h1>${title}</h1><p class="sub">${description}</p></div><div class="phone" style="--pw:820px;left:250px;top:970px"><div class="screen"><img src="${base}/${file}.png" alt="${label}"></div></div>`;
    deck.append(slide);
  }
})();
