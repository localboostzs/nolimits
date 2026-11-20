// Offline Wix appointment migration plan tests with entirely synthetic data.
import assert from 'node:assert/strict';
import {buildDryRun} from '../tools/NoLimits_WixBookingPlan_20261119.mjs';

const now=Date.parse('2026-11-19T12:00:00.000Z');
const services={'haarschnitt':{minutes:30},'bartschnitt':{minutes:15},'lang':{minutes:120}};
function row(id,service='haarschnitt',iso='2026-11-25T09:00:00+01:00',status='CONFIRMED'){
 return {wixId:id,serviceKey:service,startIso:iso,status,
  customerName:'Interner Test',customerEmail:'internal@example.invalid',customerPhone:'+41790000000'};
}
const valid=buildDryRun([
 row('WIX-LAB-1'),
 row('WIX-LAB-2','bartschnitt','2026-11-25T10:00:00+01:00'),
 row('WIX-LAB-1'),
 row('WIX-LAB-CANCEL','bartschnitt','2026-11-25T08:30:00+01:00','CANCELLED'),
 row('WIX-LAB-PAST','haarschnitt','2026-11-15T10:00:00+01:00')
],{services,now});
assert.equal(valid.ready,true);
assert.equal(valid.summary.prepared,2);
assert.equal(valid.summary.duplicates,1);
assert.equal(valid.summary.canceled,1);
assert.equal(valid.summary.past,1);
assert.equal(valid.summary.blockers,0);
assert.equal(valid.summary.conflicts,0);
assert.equal(valid.appointments[0].startIso,'2026-11-25T08:00:00.000Z');
assert.equal(valid.appointments[0].endIso,'2026-11-25T08:30:00.000Z');
assert.ok(!JSON.stringify(valid.appointments).includes('internal@example.invalid'),
 'No customer identity in safe offline planning output');

const overlapping=buildDryRun([
 row('WIX-LAB-3','haarschnitt','2026-11-25T09:00:00+01:00'),
 row('WIX-LAB-4','bartschnitt','2026-11-25T09:15:00+01:00')
],{services,now});
assert.equal(overlapping.ready,false);
assert.equal(overlapping.conflicts[0].reason,'overlapping_staff_time');
const longOverlap=buildDryRun([
 row('LONG-1','lang','2026-11-25T09:00:00+01:00'),
 row('SHORT-1','bartschnitt','2026-11-25T09:30:00+01:00'),
 row('SHORT-2','bartschnitt','2026-11-25T10:00:00+01:00')
],{services,now});
assert.equal(longOverlap.conflicts.length,2,'both short bookings overlap with the long booking');
assert.equal(longOverlap.conflicts[1].firstWixId,'LONG-1');

const invalid=buildDryRun([
 row('WIX-LAB-BAD','unknown'),
 row('WIX-LAB-TIME','haarschnitt','2026-11-25T10:00:00'),
 {...row('WIX-LAB-EMAIL'),customerEmail:'not-an-email'},
 row('WIX-LAB-STATUS','haarschnitt','2026-11-25T10:00:00+01:00','PENDING')
],{services,now});
assert.equal(invalid.ready,false);
assert.deepEqual(invalid.blockers.map(x=>x.reason),
 ['unknown_service','timezone_or_start_invalid','missing_customer_contact','unsupported_status']);
assert.equal(invalid.appointments.length,0);
assert.throws(()=>buildDryRun({}, {services,now}),/array/);
console.log('PASS: offline Wix appointment migration plan, timezone/DST offset enforcement, duplicate detection, cancellations, conflicts and PII minimization');
