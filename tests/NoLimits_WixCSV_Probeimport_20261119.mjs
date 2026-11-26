// NoLimits Wix migration rehearsal with anonymous synthetic CSV only.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const window={};
vm.runInNewContext(readFileSync('assets/js/wix-csv.js','utf8'),{window});
const parse=window.NOLIMITS_WIX_CSV.parse;
const sample=[
  '\uFEFFContact ID;First Name;Last Name;Email;Phone',
  'WIX-100;Test;Kunde;test@example.invalid;+41790000001',
  'WIX-200;"Doppelt; Nachname";"Muster, Anna";anna@example.invalid;+41790000002',
  'WIX-200;"Doppelt; Nachname";"Muster, Anna";anna@example.invalid;+41790000002',
  'WIX-300;Nur;Telefon;not-valid@;+41790000003',
  'WIX-400;Ohne;Kontakt;;'
].join('\r\n');
const a=parse(sample);
assert.equal(a.stats.rows,5);
assert.equal(a.stats.valid,3);
assert.equal(a.stats.duplicates,1);
assert.equal(a.stats.skipped,1);
assert.equal(a.stats.invalidEmails,1);
assert.equal(a.contacts[0].external_id,'wix:WIX-100');
assert.equal(a.contacts[1].name,'Doppelt; Nachname Muster, Anna');
assert.equal(a.contacts[2].email,'');
assert.equal(a.contacts[2].phone,'+41790000003');
assert.equal(JSON.stringify(parse(sample).contacts),JSON.stringify(a.contacts),
  'repeated imports must be idempotent because stable external_id is used');

const commas='Email,Full Name,Phone\n"one@example.invalid","Tester, Alpha","+41790000001"\n"two@example.invalid","Tester ""Quote""","+41790000002"';
const b=parse(commas);
assert.equal(b.stats.valid,2);
assert.equal(b.contacts[0].name,'Tester, Alpha');
assert.equal(b.contacts[1].name,'Tester "Quote"');
assert.throws(()=>parse('NoName;NoEmail\nfoo;bar'),/Wix-Kontaktspalten/);
assert.throws(()=>parse('Email,Name\n"notclosed,Test'),/Ungeschlossenes/);
assert.throws(()=>parse('Email,Name\n'),/Keine Kontaktdaten/);
const tooMany=['Email,Name'];
for(let i=0;i<2001;i++)tooMany.push('test'+i+'@example.invalid,Test');
assert.throws(()=>parse(tooMany.join('\n')),/Mehr als 2000 Kontakte/);

const admin=readFileSync('assets/js/admin.js','utf8');
const page=readFileSync('verwaltung/index.html','utf8');
assert.ok(page.includes('id="nl-wix-preview"')&&page.includes('id="nl-wix-summary"'));
assert.match(page,/id="nl-wix-import"[^>]*disabled/);
assert.ok(page.includes('wix-csv.js'));
assert.match(admin,/if\(!reviewed\|\|!reviewedFile\|\|wixFile\.files\[0\]!==reviewedFile\)/);
assert.match(admin,/if\(!wixConsent\.checked\)/);
assert.match(admin,/await A\.staff\(\)/);
assert.match(admin,/onConflict:'external_id'/);
assert.ok(!admin.includes('csvParse(input, delim)'),'legacy duplicate parser must be removed');
console.log('PASS: anonymous Wix CSV parsing, quote/semicolon/comma handling, duplicates, malformed email, 2000 limit and consent-gated preview');
