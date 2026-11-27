/* Preisänderung 2027: einmaliger Hinweis auf der Startseite. Externe Datei wegen der Content Security Policy. */
(function(){
  'use strict';
  // Approved design (24.11.2026). Switch: priceNoticeEnabled. It shows once per browser
  // session and stops on 01.01.2027 (Zurich).
  // Review at any time, also while disabled: add ?preisvorschau=1 to the homepage address.
  var priceNoticeEnabled=true;
  var force=new URLSearchParams(location.search).get('preisvorschau')==='1';
  var expired=Date.now()>=Date.parse('2027-01-01T00:00:00+01:00');
  if(!force&&(!priceNoticeEnabled||expired))return;
  var dialog=document.getElementById('nl-price-notice');
  if(!dialog||typeof dialog.showModal!=='function')return;
  var key='nolimits-price-notice-2027';
  try{if(!force&&sessionStorage.getItem(key)==='seen')return;}catch(e){}
  function close(){dialog.close();}
  dialog.querySelector('.nl-notice-close').addEventListener('click',close);
  dialog.querySelector('.nl-notice-ok').addEventListener('click',close);
  dialog.addEventListener('click',function(e){if(e.target===dialog)close();});
  dialog.addEventListener('close',function(){try{sessionStorage.setItem(key,'seen');}catch(e){}});
  dialog.showModal();
})();
