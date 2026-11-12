// Servicekonfiguration. Für Isens Konto nur diese Datei (Event-Type-IDs) und das Secret CAL_API_KEY austauschen.
export const CAL_BASE = 'https://api.cal.com';
export const TIME_ZONE = 'Europe/Zurich';

export const SERVICES = {
  'test-haarschnitt': {
    eventTypeId: 7887269, // echte Cal.com Event-Type-ID von «NoLimits TEST – Haarschnitt»
    name: 'NoLimits TEST – Haarschnitt',
    minutes: 30,
  },
};
