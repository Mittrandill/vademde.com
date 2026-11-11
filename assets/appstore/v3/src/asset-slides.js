// 1.1.0 slaytları (11–14): Varlıklarım ve Sesle kayıt. İki dilde de gerçek uygulama çekimleri
// kullanılır (shots/ ve shots-en/ aynı yerleşimde), bu yüzden büyütülmüş parçalar (.pop.keep)
// İngilizcede de korunur. Yerleşim 2–10. slaytlarla aynı ölçüdedir: 900 px telefon, alttan taşar.
(() => {
  const params = new URLSearchParams(location.search);
  const english = params.get('lang') === 'en';
  const android = location.pathname.endsWith('/play.html');
  const base = android ? (english ? 'shots-en-android' : 'shots-tr-android') : (english ? 'shots-en' : 'shots');
  if (android && Number(params.get('s')) >= 11) document.documentElement.classList.add('native-android');

  const style = document.createElement('style');
  style.textContent = `
    .said{position:absolute;z-index:5;display:flex;gap:30px;align-items:flex-start;padding:38px 44px;border-radius:56px;
      background:rgba(43,45,49,.94);backdrop-filter:blur(30px);
      box-shadow:0 40px 90px rgba(0,0,0,.6),inset 0 0 0 2px rgba(255,255,255,.08)}
    .said .mic{flex:none;width:96px;height:96px;border-radius:50%;display:grid;place-items:center;
      background:radial-gradient(circle at 50% 50%,var(--saffron) 0 46%,var(--violet) 47% 100%);
      box-shadow:0 0 50px rgba(107,77,255,.55)}
    .said .mic svg{width:44px;height:44px}
    .said p{font-size:42px;line-height:1.32;font-weight:600;color:var(--text);letter-spacing:-.01em}
    .said small{display:block;margin-bottom:8px;font-size:30px;font-weight:600;color:var(--text2);letter-spacing:.02em}`;
  document.head.append(style);

  const micIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="#1F2126" stroke-width="2.4" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';

  const slides = english ? [
    {
      label: 'My Assets', title: 'Property, vehicles.<br><em>One place.</em>',
      sub: 'Record your own estimated values and ownership shares. Keep your assets in view.',
      file: 'assets', left: 210, top: 950, pop: '40,1475,1126,720', ring: false,
    },
    {
      label: 'Every asset, in detail', title: 'Know its value.<br><em>Follow its costs.</em>',
      sub: 'Link fuel, insurance, rent and loan records. Review each asset’s details and value history.',
      file: 'asset-detail', left: 330, top: 930, pop: '40,1555,1126,540', ring: true,
    },
    {
      label: 'Voice entry <span>· Plus</span>', title: 'Just say it.<br><em>Vademde</em> writes it.',
      sub: 'Cheque, invoice, expense or transfer: describe it. Vademde asks for anything missing.',
      file: 'voice-listen', left: 210, top: 1180,
      said: ['You said', '“I received a cheque from Kuzey İnşaat for 200,000 lira, due December 2nd.”'],
    },
    {
      label: 'You confirm', title: 'Form ready.<br><em>Check it,</em> save it.',
      sub: 'Amount, due date, serial number and contact are filled in for you. <b>Nothing is saved until you approve.</b>',
      file: 'voice-form', left: 330, top: 930, pop: '40,1550,1126,820', ring: true,
    },
  ] : [
    {
      label: 'Varlıklarım', title: 'Evin, arsan, aracın.<br><em>Tek yerde.</em>',
      sub: 'Tahmini değerlerini ve sahiplik payını kendin gir. Varlıklarını birlikte takip et.',
      file: 'assets', left: 210, top: 950, pop: '40,1475,1126,720', ring: false,
    },
    {
      label: 'Varlığının ayrıntıları', title: 'Değerini bil.<br><em>Giderini izle.</em>',
      sub: 'Yakıt, sigorta, kira ve kredi kayıtlarını ilişkilendir. Varlık bilgilerini ve değer geçmişini gör.',
      file: 'asset-detail', left: 330, top: 930, pop: '40,1555,1126,540', ring: true,
    },
    {
      label: 'Sesle kayıt <span>· Plus</span>', title: 'Söyle,<br><em>Vademde</em> yazsın.',
      sub: 'Çek, fatura, gider ya da transfer; ne olduğunu anlat. Eksik bilgiyi Vademde sorar.',
      file: 'voice-listen', left: 210, top: 1180,
      said: ['Söylediğiniz', '“Kuzey İnşaat’tan 200 bin liralık çek aldım, vadesi 2 Aralık.”'],
    },
    {
      label: 'Siz onaylarsınız', title: 'Form hazır.<br><em>Kontrol et,</em> kaydet.',
      sub: 'Tutar, vade, seri no ve cari kendiliğinden dolar. <b>Kayıt yalnızca siz onaylayınca oluşur.</b>',
      file: 'voice-form', left: 330, top: 930, pop: '40,1495,1126,820', ring: true,
    },
  ];

  const deck = document.querySelector('.deck');
  const glow = ['--gx:85%;--gy:35%', '--gx:15%;--gy:40%;--hx:95%;--hy:90%', '--gx:80%;--gy:30%;--g2:rgba(107,77,255,.30)', '--gx:20%;--gy:25%;--hx:90%;--hy:90%'];
  slides.forEach((s, i) => {
    const slide = document.createElement('section');
    slide.className = 'slide asset-slide';
    slide.setAttribute('style', glow[i]);
    const src = `${base}/${s.file}.png`;
    // Android (play.html) yerleşimi kendi CSS'iyle çalışır; büyütmeler yalnızca iOS çekimlerinin koordinatına uyar.
    const pop = s.pop && !android
      ? `<div class="pop keep${s.ring ? ' ring' : ''}" data-src="${src}" data-box="${s.pop}" data-k="1.06" style="left:70px"></div>` : '';
    const said = s.said
      ? `<div class="said" style="left:70px;right:70px;top:${android ? 700 : s.top - 290}px"><span class="mic">${micIcon}</span><p><small>${s.said[0]}</small>${s.said[1]}</p></div>` : '';
    slide.innerHTML = `<div class="copy"><div class="eyebrow"><i></i>${s.label}</div><h1>${s.title}</h1><p class="sub">${s.sub}</p></div>`
      + `<div class="phone" style="--pw:900px;left:${s.left}px;top:${s.top}px${android && s.said ? ';top:960px!important' : ''}"><div class="screen"><img src="${src}" alt=""></div></div>${pop}${said}`;
    deck.append(slide);
  });
})();
