/* NoLimits – local Wix CSV contact migration preparation.
   No network calls, no personal information leaves the browser until the
   operator explicitly confirms the approved import. */
(function(root){
  'use strict';
  function normalise(header){
    return String(header||'').replace(/^\uFEFF/,'').trim().toLowerCase()
      .replace(/ä/g,'a').replace(/ö/g,'o').replace(/ü/g,'u').replace(/ß/g,'ss')
      .replace(/[^a-z0-9]/g,'');
  }
  function parseRows(csv,delimiter){
    var rows=[],row=[],cell='',quoted=false;
    for(var i=0;i<csv.length;i++){
      var ch=csv[i];
      if(ch==='"'){
        if(quoted&&csv[i+1]==='"'){cell+='"';i++;}
        else if(!quoted&&!cell){quoted=true;}
        else if(quoted){quoted=false;}
        else throw Error('Ungültiges Anführungszeichen in der CSV.');
      }else if(!quoted&&(ch===','||ch===';')&&ch===delimiter){
        row.push(cell);cell='';
      }else if(!quoted&&(ch==='\r'||ch==='\n')){
        row.push(cell);
        if(row.some(function(x){return x.trim();}))rows.push(row);
        row=[];cell='';
        if(ch==='\r'&&csv[i+1]==='\n')i++;
      }else cell+=ch;
    }
    if(quoted)throw Error('Ungeschlossenes Anführungszeichen in der CSV-Datei.');
    row.push(cell);
    if(row.some(function(x){return x.trim();}))rows.push(row);
    return rows;
  }
  function parse(csv){
    if(typeof csv!=='string'||!csv.trim())throw Error('Die CSV-Datei ist leer.');
    if(csv.length>5*1024*1024)throw Error('CSV-Datei ist zu gross (max. 5 MB).');
    var firstLine=csv.split(/\r?\n/,1)[0];
    var delimiter=(firstLine.match(/;/g)||[]).length>(firstLine.match(/,/g)||[]).length?';':',';
    var rows=parseRows(csv,delimiter);
    if(rows.length<2)throw Error('Keine Kontaktdaten gefunden.');
    var head=rows.shift().map(normalise);
    if(rows.length>2000)throw Error('Mehr als 2000 Kontakte. Bitte den Export in mehrere CSV-Dateien aufteilen.');
    var keys={
      id:['contactid','wixcontactid','id','contactsid'],
      email:['email','emailaddress','primaryemail','emails','emailadresse','email1'],
      phone:['phone','phonenumber','telefon','telephone','mobile','handynummer','primaryphone'],
      name:['name','displayname','fullname','contactname'],
      first:['firstname','vorname','givenname'],
      last:['lastname','nachname','surname','familyname']
    };
    var hasAny=Object.values(keys).flat().some(function(k){return head.includes(k);});
    if(!hasAny)throw Error('Keine passenden Wix-Kontaktspalten gefunden.');
    function get(row,aliases){
      for(var k of aliases){var i=head.indexOf(k);if(i>=0&&row[i])return String(row[i]).trim();}
      return '';
    }
    var contacts=[],seen=new Set();
    var stats={rows:rows.length,valid:0,skipped:0,duplicates:0,invalidEmails:0};
    for(var row of rows){
      var id=get(row,keys.id).slice(0,140);
      var email=get(row,keys.email).trim().toLowerCase().slice(0,120);
      var phone=get(row,keys.phone).slice(0,30);
      var first=get(row,keys.first);
      var last=get(row,keys.last);
      var name=(get(row,keys.name)||[first,last].filter(Boolean).join(' ')).slice(0,100);
      if(email&&!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(email)){
        email='';stats.invalidEmails++;
      }
      if(!email&&!phone){stats.skipped++;continue;}
      var external=(id?'wix:':email?'email:':'phone:')+(id||email||phone);
      if(seen.has(external)){stats.duplicates++;continue;}
      seen.add(external);
      contacts.push({source:'wix',external_id:external.slice(0,180),name:(name||email||phone),email,phone});
    }
    if(!contacts.length)throw Error('Keine geeigneten Kontakte mit E-Mail oder Telefonnummer gefunden.');
    stats.valid=contacts.length;
    return {contacts,stats};
  }
  root.NOLIMITS_WIX_CSV=Object.freeze({parse});
})(typeof window==='object'?window:globalThis);
