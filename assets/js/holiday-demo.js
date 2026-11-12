/* Visuelle Demo nur mit ?ferien-demo=1; KEINE echte Kalendersperre. */
(function () {
  'use strict';
  if (new URLSearchParams(window.location.search).get('ferien-demo') !== '1') return;
  function showDemo() {
    var previous = document.activeElement;
    var overlay = document.createElement('div');
    overlay.className = 'nld-backdrop';
    overlay.innerHTML = '<section class="nld-panel" role="dialog" aria-modal="true" aria-labelledby="nld-title" aria-describedby="nld-desc">' +
      '<span class="nld-eyebrow">Demo · Ferieninformation</span>' +
      '<h2 id="nld-title">Wir machen eine kurze Pause.</h2>' +
      '<p id="nld-desc">Vom [Startdatum] bis [Enddatum] bleibt der Barbershop geschlossen. Termine können vor oder nach den Ferien gebucht werden.</p>' +
      '<button type="button" class="btn btn-ink" id="nld-close">Verstanden</button>' +
      '<p class="nld-disclaimer">Nur eine Designvorschau. Der Testkalender wird hierdurch nicht gesperrt.</p>' +
      '</section>';
    document.body.appendChild(overlay);
    document.body.classList.add('nld-modal-open');
    var close = overlay.querySelector('#nld-close');
    function dismiss() {
      document.removeEventListener('keydown', keyboard);
      overlay.remove();
      document.body.classList.remove('nld-modal-open');
      if (previous && typeof previous.focus === 'function') previous.focus();
    }
    function keyboard(e) {
      if (e.key === 'Escape') dismiss();
      if (e.key === 'Tab') { e.preventDefault(); close.focus(); }
    }
    document.addEventListener('keydown', keyboard);
    close.addEventListener('click', dismiss);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) dismiss(); });
    close.focus();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showDemo);
  else showDemo();
})();
