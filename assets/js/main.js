(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('js');

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    /* Buchungs-Buttons: zentrale BOOKING_URL aus assets/js/config.js */
    var cfg = window.NOLIMITS_CONFIG || {};
    if (cfg.BOOKING_URL) {
      var links = document.querySelectorAll('a[data-booking]');
      for (var i = 0; i < links.length; i++) links[i].setAttribute('href', cfg.BOOKING_URL);
    }

    /* Kopfzeile: Zustand beim Scrollen */
    var header = document.querySelector('.site-header');
    function onScroll() {
      if (header) header.classList.toggle('is-scrolled', window.scrollY > 24);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    /* Mobiles Menü */
    var btn = document.querySelector('.menu-btn');
    var nav = document.getElementById('nav');
    function setMenu(open) {
      root.classList.toggle('menu-open', open);
      if (btn) {
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        btn.setAttribute('aria-label', open ? 'Menü schliessen' : 'Menü öffnen');
      }
    }
    if (btn && nav) {
      btn.addEventListener('click', function () { setMenu(!root.classList.contains('menu-open')); });
      nav.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && root.classList.contains('menu-open')) { setMenu(false); btn.focus(); }
      });
      window.matchMedia('(min-width: 900px)').addEventListener('change', function (e) { if (e.matches) setMenu(false); });
    }

    /* Sanftes Einblenden beim Scrollen */
    var items = document.querySelectorAll('.reveal');
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!('IntersectionObserver' in window) || reduce) {
      for (var j = 0; j < items.length; j++) items[j].classList.add('is-in');
    } else {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); }
        });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      for (var k = 0; k < items.length; k++) io.observe(items[k]);
    }
  });
})();
