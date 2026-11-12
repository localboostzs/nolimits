// Servicekonfiguration. Für Isens Konto nur diese Datei (Event-Type-IDs) und das Secret CAL_API_KEY austauschen.
export const CAL_BASE = 'https://api.cal.com';
export const TIME_ZONE = 'Europe/Zurich';

export const SERVICES = {
  'haarschnitt-bartschnitt-rasieren': { eventTypeId: 7888954, name: "Haarschnitt mit Bartschnitt und Rasieren", minutes: 60, price: 60 },
  'haarschnitt-bartschnitt-augenbrauen': { eventTypeId: 7888956, name: "Haarschnitt mit Bartschnitt + Augenbrauen", minutes: 45, price: 55 },
  'haarschnitt-waschen': { eventTypeId: 7888952, name: "Haarschnitt mit Waschen", minutes: 45, price: 50 },
  'haarschnitt-bartschnitt': { eventTypeId: 7888951, name: "Haarschnitt & Bartschnitt", minutes: 45, price: 45 },
  'classic-scissor-cut': { eventTypeId: 7888958, name: "Classic Hair Scissor Cut", minutes: 30, price: 40 },
  'haarschnitt': { eventTypeId: 7888953, name: "Haarschnitt", minutes: 30, price: 30 },
  'jugendliche-10-14': { eventTypeId: 7888957, name: "Jugendliche (von 10 bis 14 Jahre alt)", minutes: 30, price: 25 },
  'bartschnitt': { eventTypeId: 7888955, name: "Bartschnitt", minutes: 15, price: 15 },
  'augenbrauen-zupfen': { eventTypeId: 7888946, name: "Augenbrauen zupfen", minutes: 15, price: 15 },
  'test-haarschnitt': { eventTypeId: 7887269, name: 'NoLimits TEST – Haarschnitt', minutes: 30 },
};
