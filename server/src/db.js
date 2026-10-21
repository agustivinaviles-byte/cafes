/**
 * "Base de datos" en un archivo JSON con escritura atómica.
 *
 * Suficiente para un MVP o un solo servidor. La interfaz (funciones de abajo)
 * está aislada para que puedas cambiarla por PostgreSQL/Mongo sin tocar las rutas.
 *
 * Colecciones:
 *  - cards:          negocios / plantillas de tarjeta
 *  - customers:      cada pase emitido a un cliente (serial único)
 *  - registrations:  dispositivos Apple registrados para recibir push
 *  - notifications:  historial de notificaciones masivas
 */
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

const DB_FILE = path.join(config.dataDir, 'db.json');
const EMPTY = { cards: {}, customers: {}, registrations: [], notifications: [] };

let state = structuredClone(EMPTY);
let writeQueue = Promise.resolve();

export function initDb() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      state = { ...structuredClone(EMPTY), ...JSON.parse(fs.readFileSync(DB_FILE, 'utf8')) };
    } catch (err) {
      // Nunca sobrescribimos un archivo corrupto: lo respaldamos.
      const backup = `${DB_FILE}.corrupt-${Date.now()}`;
      fs.copyFileSync(DB_FILE, backup);
      console.error(`[db] db.json corrupto, respaldado en ${backup}:`, err.message);
    }
  }
  console.log(`[db] ${Object.keys(state.cards).length} tarjetas, ${Object.keys(state.customers).length} pases`);
}

/** Persiste en disco: escribe a un temporal y renombra (atómico). Serializado en cola. */
function persist() {
  const snapshot = JSON.stringify(state, null, 2);
  writeQueue = writeQueue
    .then(async () => {
      const tmp = `${DB_FILE}.tmp`;
      await fs.promises.writeFile(tmp, snapshot);
      await fs.promises.rename(tmp, DB_FILE);
    })
    .catch((err) => console.error('[db] Error al guardar:', err));
  return writeQueue;
}

// ───────────── Cards (negocios) ─────────────
export const getCard = (id) => state.cards[id] || null;

export async function saveCard(card) {
  state.cards[card.id] = card;
  await persist();
  return card;
}

// ───────────── Customers (pases) ─────────────
export const getCustomer = (serial) => state.customers[serial] || null;

export const listCustomers = (cardId) =>
  Object.values(state.customers)
    .filter((c) => c.cardId === cardId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export async function saveCustomer(customer) {
  state.customers[customer.serial] = customer;
  await persist();
  return customer;
}

/** Marca pases como modificados (Apple usa updatedAt como "tag" de cambios). */
export async function touchCustomers(serials) {
  const now = new Date().toISOString();
  for (const s of serials) if (state.customers[s]) state.customers[s].updatedAt = now;
  await persist();
}

// ───────────── Registrations (Apple) ─────────────
export const findRegistration = (deviceId, serial) =>
  state.registrations.find((r) => r.deviceLibraryIdentifier === deviceId && r.serial === serial) || null;

export const registrationsForDevice = (deviceId, passTypeIdentifier) =>
  state.registrations.filter(
    (r) => r.deviceLibraryIdentifier === deviceId && r.passTypeIdentifier === passTypeIdentifier,
  );

export const registrationsForSerials = (serials) => {
  const set = new Set(serials);
  return state.registrations.filter((r) => set.has(r.serial));
};

export async function addRegistration(reg) {
  const existing = findRegistration(reg.deviceLibraryIdentifier, reg.serial);
  if (existing) {
    existing.pushToken = reg.pushToken; // el token puede rotar
    await persist();
    return { created: false };
  }
  state.registrations.push({ ...reg, createdAt: new Date().toISOString() });
  await persist();
  return { created: true };
}

export async function removeRegistration(deviceId, serial) {
  const before = state.registrations.length;
  state.registrations = state.registrations.filter(
    (r) => !(r.deviceLibraryIdentifier === deviceId && r.serial === serial),
  );
  if (state.registrations.length !== before) await persist();
}

/** APNs devolvió 410: el token ya no es válido. */
export async function removePushToken(pushToken) {
  state.registrations = state.registrations.filter((r) => r.pushToken !== pushToken);
  await persist();
}

// ───────────── Notifications ─────────────
export async function addNotification(entry) {
  state.notifications.unshift(entry);
  state.notifications = state.notifications.slice(0, 500);
  await persist();
}

export const listNotifications = (cardId, limit = 20) =>
  state.notifications.filter((n) => n.cardId === cardId).slice(0, limit);

export const flushDb = () => writeQueue;
