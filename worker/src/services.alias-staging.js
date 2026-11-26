// The staging-only service map is intentionally isolated from live NoLimits services.
// Every request to the public /api/book route uses the hidden Cal.com LAB event 7982460.
export const CAL_BASE = 'https://api.cal.com';
export const TIME_ZONE = 'Europe/Zurich';
export const SERVICES = Object.freeze({
  'haarschnitt': { eventTypeId: 7982460, name: 'NoLimits LAB Alias-Test (kein Kundentermin)', minutes: 15, price: 0 }
});
