// Offline-only regression: booking links stay inside the site that serves the page,
// on every host and path. No network calls, bookings or deployments.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source = fs.readFileSync('assets/js/config.js','utf8');
function lookup(script, page) {
  const context = { URL, window:{location:{href:page}}, document:{currentScript:script ? {src:script} : null} };
  vm.runInNewContext(source,context,{timeout:1000});
  return context.window.NOLIMITS_CONFIG?.BOOKING_URL;
}
for (const site of ['https://www.nolimits-barber.ch/','https://nolimits-barber.ch/','https://nolimits-barber.pages.dev/',
  'https://localboostzs.github.io/nolimits/','http://127.0.0.1:8123/']) {
  assert.equal(lookup(site+'assets/js/config.js?v=1',site+'leistungen/'),site+'booking-test/','link on '+site);
}
// Without currentScript the site root of the current page is used.
assert.equal(lookup(null,'https://www.nolimits-barber.ch/leistungen/'),'https://www.nolimits-barber.ch/booking-test/');
assert.doesNotMatch(source,/github\.io\/|nolimits-barber\.ch/,'no fixed address left');
for (const page of ['index.html','leistungen/index.html','kontakt/index.html','ueber-mich/index.html','impressum/index.html','booking-test/index.html']) {
  const html = fs.readFileSync(page,'utf8');
  assert.doesNotMatch(html,/href="https:\/\/localboostzs\.github\.io/,page);
  assert.match(html,/src="(\.\.\/)?assets\/js\/config\.js\?v=/,page);
}
console.log('PASS: NoLimits booking links follow the serving site on every host and path.');
