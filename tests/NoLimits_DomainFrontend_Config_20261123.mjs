// Offline-only regression: booking CTAs use the custom-domain ROOT, not /nolimits/.
// No network calls, real bookings, secret handling, or changes to deployed GitHub Pages.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = fs.readFileSync('assets/js/config.js','utf8');
function lookup(url) {
  const u = new URL(url);
  const context = {window:{location:{hostname:u.hostname,origin:u.origin}}};
  vm.runInNewContext(source,context,{timeout:1000});
  return context.window.NOLIMITS_CONFIG?.BOOKING_URL;
}
const cases = [
  ['https://localboostzs.github.io/nolimits/','https://localboostzs.github.io/nolimits/booking-test/'],
  ['https://www.nolimits-barber.ch/','https://www.nolimits-barber.ch/booking-test/'],
  ['https://nolimits-barber.ch/','https://nolimits-barber.ch/booking-test/'],
  ['https://www.nolimits-barber.ch/leistungen/','https://www.nolimits-barber.ch/booking-test/'],
  ['https://nolimits-barber.ch.malicious.example/','https://localboostzs.github.io/nolimits/booking-test/'],
  ['https://attacker.example/','https://localboostzs.github.io/nolimits/booking-test/']
];
for(const [input,expected] of cases)assert.equal(lookup(input),expected,'CTA on '+input);
console.log('PASS: NoLimits CTA host allowlist, production custom-root paths, demo fallback and spoofing defence.');
