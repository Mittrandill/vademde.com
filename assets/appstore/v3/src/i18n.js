// İngilizce mağaza seti: ?lang=en ile yalnızca telefon ekranı DIŞINDAKİ pazarlama metinleri çevrilir.
// Uygulama yalnızca Türkçe olduğundan telefon içindeki (.screen) her şey Türkçe kalır.
// Anahtarlar HTML'deki metinle birebir aynı olmalı (innerHTML parçası).
const EN = [
  // shots.html
  ['Akıllı belge okuma', 'Smart document scanning'],
  ['Fotoğrafını çek.<br><em>Vademde</em> okusun.', 'Snap a photo.<br><em>Vademde</em> reads it.'],
  ['Çek, senet, fatura, dekont ya da kredi ödeme planı. Tutar, vade ve taraflar saniyeler içinde forma dökülür.', 'Cheques, promissory notes, invoices, receipts or loan plans. Amount, due date and parties are filled in within seconds.'],
  ['3 alan okundu <small>· %99 güven</small>', '3 fields read <small>· 99% confidence</small>'],
  ['Siz onaylarsınız', 'You confirm'],
  ['Okunan her alan<br>önce <em>size</em> gelir.', 'Every field comes<br>to <em>you</em> first.'],
  ['Emin olunmayan alanlar işaretlenir. <b>Onayınız olmadan hiçbir kayıt oluşmaz.</b>', 'Uncertain fields are flagged. <b>Nothing is saved without your approval.</b>'],
  ['Güven %99', '99% confidence'],
  ['Ana sayfa', 'Home'],
  ['Bakiye, borç, alacak.<br><em>Tek bakışta.</em>', 'Your money,<br><em>at a glance.</em>'],
  ['Hesaplarınız, kartlarınız ve yaklaşan vadeleriniz tek ekranda toplanır.', 'Accounts, cards and upcoming due dates, all on one screen.'],
  ['Vade takvimi', 'Due calendar'],
  ['Hiçbir vade<br><em>sessizce</em> geçmez.', 'Never miss<br>a <em>due date.</em>'],
  ['Çek, senet, taksit ve faturalar tek takvimde. Ne zaman hatırlatılacağını siz seçersiniz.', 'Cheques, notes, installments and bills in one calendar. You choose when to be reminded.'],
  ['Ödeme hatırlatması <small>şimdi</small>', 'Payment reminder <small>now</small>'],
  ['Enerjisa Elektrik faturasının son ödeme günü 12 Ekim · ₺1.842,60', 'Your Enerjisa electricity bill is due on 12 Oct · ₺1,842.60'],
  ['Çek ve senet', 'Cheques &amp; notes'],
  ['Portföyünüz<br><em>cebinizde.</em>', 'Your portfolio,<br><em>in your pocket.</em>'],
  ['Aldığınız, verdiğiniz ve ciro ettiğiniz her çeki ve senedi yolculuğuyla takip edin.', 'Track every cheque and note you receive, issue or endorse, along its whole journey.'],
  ['Krediler', 'Loans'],
  ['Krediniz<br><em>taksit taksit.</em>', 'Loans, paid<br><em>step by step.</em>'],
  ['Ödeme planını tarayın; kalan borç, sıradaki taksit ve bitiş tarihi hep elinizin altında.', 'Scan the payment plan; remaining balance, next installment and end date are always at hand.'],
  ['Kredi kartları', 'Credit cards'],
  ['Limit, ekstre,<br><em>son ödeme.</em>', 'Limit, statement,<br><em>due date.</em>'],
  ['Ekstreyi tarayın; harcamalar, taksitler ve kalan limit tek kartta.', 'Scan your statement; purchases, installments and remaining limit on one card.'],
  ['Cari hesaplar', 'Contact ledgers'],
  ['Kim size borçlu,<br><em>kime</em> borçlusunuz?', 'Who owes you,<br>who <em>you</em> owe.'],
  ['Firma ve kişi bazında bakiye, açık kayıtlar, çekler ve faturalar bir arada.', 'Balances, open records, cheques and invoices for every company and person.'],
  ['Raporlar', 'Reports'],
  ['Paranız<br><em>nereye</em> gidiyor?', 'Where does<br>your money <em>go?</em>'],
  ['Gelir, gider, kategori ve kur raporları. <b>Plus</b> ile akıllı özet ve öneriler.', 'Income, expense, category and currency reports. Smart summaries and insights with <b>Plus</b>.'],
  ['Bankalar <span>· Ekip paylaşımı</span>', 'Banks <span>· Team sharing</span>'],
  ['Tüm bankalarınız<br><em>tek ekranda.</em>', 'All your banks,<br><em>one screen.</em>'],
  ['Hesap, kart ve kredileri bankaya göre görün. Çalışma alanınızı ekibinizle paylaşın.', 'See accounts, cards and loans by bank. Share your workspace with your team.'],
  // creative.html
  ['Çek vadesi yaklaşıyor <small>şimdi</small>', 'Cheque due soon <small>now</small>'],
  ['Kuzey İnşaat · ₺120.000,00 · 27 Eki', 'Kuzey İnşaat · ₺120,000.00 · 27 Oct'],
  ['Çek, senet, fatura, kredi.<br><em>Fotoğrafla</em> takibe al.', 'Cheques, notes, bills, loans.<br><em>Snap</em> to track.'],
  ['Kayıt oluşturuldu', 'Record created'],
  ['Onayınızla · Güven %99', 'With your approval · 99% confidence'],
  // play.html (Android bildirimi ve kapak görseli)
  ['Vademde <small>· şimdi</small>', 'Vademde <small>· now</small>'],
  ['Ödeme hatırlatması', 'Payment reminder'],
  ['Belgeyi tarayın, onaylayın; vadeler ve bakiyeler kendiliğinden düzenlensin.', 'Scan, confirm, done: due dates and balances organise themselves.'],
];

const TRANSLATABLE = '.eyebrow, h1, .sub, .chip, .notif .app, .notif .t, .notif p, .card .t, .card p, .phrase';

if (new URLSearchParams(location.search).get('lang') === 'en') {
  document.documentElement.lang = 'en';
  // Tarayıcı innerHTML'i normalize ettiği için (& → &amp;) karşılaştırma aynı biçimle yapılır.
  const norm = (html) => { const t = document.createElement('template'); t.innerHTML = html; return t.innerHTML; };
  // Uzun anahtar önce: kısa bir anahtar (ör. 'Güven %99') daha uzun bir cümlenin parçasıysa onu bozmasın.
  const pairs = EN.map(([tr, en]) => [norm(tr), en]).sort((a, b) => b[0].length - a[0].length);
  document.querySelectorAll(TRANSLATABLE).forEach((el) => {
    if (el.closest('.screen')) return;
    let html = el.innerHTML;
    for (const [tr, en] of pairs) html = html.split(tr).join(en);
    el.innerHTML = html;
  });
}

// Başlık en fazla iki satır: taşarsa yazı boyutu küçültülür (iki dil için de güvenli).
document.querySelectorAll('h1').forEach((h) => {
  const lh = () => parseFloat(getComputedStyle(h).lineHeight);
  let size = parseFloat(getComputedStyle(h).fontSize);
  while (h.offsetHeight > lh() * 2.1 && size > 80) {
    size -= 4;
    h.style.fontSize = `${size}px`;
  }
});
