// Store artwork uses complete native captures for the selected platform and language.
(() => {
  const english = new URLSearchParams(location.search).get('lang') === 'en';
  const android = location.pathname.endsWith('/play.html');
  if (!english && !android) return;
  if (android) document.documentElement.classList.add('native-android');
  const folder = android ? (english ? 'shots-en-android/' : 'shots-tr-android/') : 'shots-en/';
  document.querySelectorAll('.screen img').forEach((img) => {
    img.setAttribute('src', img.getAttribute('src').replace(/^shots\//, folder));
  });
  // Historical crop coordinates and overlays do not describe the current native layout.
  document.querySelectorAll('.pop, .screen .cheque, .screen .scanline, .chip').forEach((el) => el.remove());
})();
