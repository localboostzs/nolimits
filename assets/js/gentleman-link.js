/* Gentleman Rasur erst buchbar machen, wenn der Worker sie öffentlich anbietet. Externe Datei wegen der Content Security Policy. */
(function(){
  'use strict';
  var link=document.getElementById('nl-gentleman-book');
  var cfg=window.NOLIMITS_BOOKING||{};
  if(!link||!cfg.API_BASE)return;
  fetch(cfg.API_BASE.replace(/\/$/,'')+'/api/services',{cache:'no-store'})
    .then(function(res){if(!res.ok)throw new Error('Service list unavailable');return res.json();})
    .then(function(data){
      if(!data||!Array.isArray(data.services))return;
      if(!data.services.some(function(s){return s.key==='gentleman-rasur';}))return;
      link.href='../booking-test/?service=gentleman-rasur';
      link.removeAttribute('aria-disabled');
      link.removeAttribute('style');
      link.setAttribute('aria-label','Gentleman Rasur buchen');
      link.textContent='Buchen';
    }).catch(function(){/* fail closed until public booking is available */});
})();
