/**
 * Google Wallet API (antes "Google Pay API for Passes") — tipo Loyalty.
 *
 * - Cada negocio = una LoyaltyClass   (id: <issuerId>.card_<cardId>)
 * - Cada cliente = un LoyaltyObject   (id: <issuerId>.<serial>)
 * - "Guardar en Google Wallet" = un JWT firmado con la cuenta de servicio:
 *      https://pay.google.com/gp/v/save/<jwt>
 * - Actualizaciones y mensajes = REST API con un token OAuth de la misma cuenta.
 *
 * Se usa solo `node:crypto` y `fetch` (sin SDKs) para mantener pocas dependencias.
 * Referencia: https://developers.google.com/wallet/retail/loyalty-cards
 */
import crypto from 'node:crypto';
import { config } from '../config.js';
import { HttpError } from '../utils.js';
import { publicLogoUrl } from './images.js';

const API = 'https://walletobjects.googleapis.com/walletobjects/v1';
const SCOPE = 'https://www.googleapis.com/auth/wallet_object.issuer';

// ───────────── JWT (RS256) ─────────────
const b64url = (input) =>
  Buffer.from(typeof input === 'string' ? input : JSON.stringify(input)).toString('base64url');

/** Firma un JWT RS256 con la llave privada de la cuenta de servicio. */
export function signJwt(payload, privateKey) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const unsigned = `${b64url(header)}.${b64url(payload)}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(privateKey, 'base64url');
  return `${unsigned}.${signature}`;
}

// ───────────── IDs ─────────────
export const classId = (card) => `${config.google.issuerId}.card_${card.id.replace(/-/g, '')}`;
export const objectId = (customer) => `${config.google.issuerId}.${customer.serial}`;

// ───────────── Modelos ─────────────
export function buildLoyaltyClass(card) {
  return {
    id: classId(card),
    issuerName: card.name,
    programName: card.name,
    programLogo: {
      sourceUri: { uri: publicLogoUrl(card) },
      contentDescription: { defaultValue: { language: 'es-MX', value: `Logo de ${card.name}` } },
    },
    hexBackgroundColor: card.color,
    countryCode: config.google.countryCode,
    reviewStatus: 'UNDER_REVIEW',
    rewardsTier: 'Miembro',
    linksModuleData: {
      uris: [{ uri: `tel:${card.phone.replace(/[^\d+]/g, '')}`, description: `Llamar a ${card.name}`, id: 'phone' }],
    },
  };
}

export function buildLoyaltyObject(card, customer) {
  const label = card.pointsLabel || 'Puntos';
  return {
    id: objectId(customer),
    classId: classId(card),
    state: 'ACTIVE',
    accountId: customer.serial.slice(0, 8).toUpperCase(),
    accountName: customer.name,
    loyaltyPoints: { label, balance: { int: customer.points } },
    secondaryLoyaltyPoints: {
      label: 'Meta',
      balance: {
        string: customer.points >= card.rewardGoal ? '¡Lista!' : `${customer.points}/${card.rewardGoal}`,
      },
    },
    barcode: { type: 'QR_CODE', value: customer.serial, alternateText: customer.serial.slice(0, 8).toUpperCase() },
    textModulesData: [
      { id: 'reward', header: 'Recompensa', body: card.rewardDescription },
      { id: 'news', header: 'Novedades', body: card.lastMessage?.text || `¡Gracias por tu preferencia en ${card.name}!` },
    ],
  };
}

function assertEnabled() {
  if (!config.google.enabled) {
    throw new HttpError(503, 'Google Wallet no está configurado en el servidor', {
      hint: 'Configura GOOGLE_ISSUER_ID y GOOGLE_SERVICE_ACCOUNT_FILE en .env (ver README).',
    });
  }
}

/**
 * Enlace "Agregar a Google Wallet". Primero crea el objeto con la REST API
 * (así los errores de validación salen aquí y no como "no se puede agregar"
 * en el celular) y el JWT solo lleva su id.
 */
export async function createSaveUrl(card, customer) {
  assertEnabled();
  const obj = buildLoyaltyObject(card, customer);
  let res = await gapi('POST', '/loyaltyObject', obj);
  if (res.status === 404) {
    // La clase aún no existe (p. ej. tarjeta creada antes de configurar Google)
    await upsertClass(card);
    res = await gapi('POST', '/loyaltyObject', obj);
  }
  if (!res.ok && res.status !== 409) {
    console.warn('[google] insertObject', res.status, res.data);
    throw new HttpError(502, 'Google Wallet rechazó el pase', { status: res.status, error: res.data });
  }

  const sa = config.google.serviceAccount;
  const token = signJwt(
    {
      iss: sa.client_email,
      aud: 'google',
      typ: 'savetowallet',
      iat: Math.floor(Date.now() / 1000),
      origins: [new URL(config.publicUrl).origin],
      payload: { loyaltyObjects: [{ id: obj.id, classId: obj.classId }] },
    },
    sa.private_key,
  );
  return `https://pay.google.com/gp/v/save/${token}`;
}

// ───────────── REST API ─────────────
let cachedToken = { value: null, exp: 0 };

/** Token OAuth2 (flujo JWT-bearer de cuenta de servicio), cacheado ~55 min. */
async function getAccessToken() {
  if (cachedToken.value && Date.now() < cachedToken.exp) return cachedToken.value;
  const sa = config.google.serviceAccount;
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt(
    { iss: sa.client_email, scope: SCOPE, aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 },
    sa.private_key,
  );
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  if (!res.ok) throw new Error(`OAuth Google ${res.status}: ${await res.text()}`);
  const data = await res.json();
  cachedToken = { value: data.access_token, exp: Date.now() + (data.expires_in - 300) * 1000 };
  return cachedToken.value;
}

async function gapi(method, path, body) {
  const token = await getAccessToken();
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, data: text ? safeJson(text) : null };
}

const safeJson = (t) => { try { return JSON.parse(t); } catch { return t; } };

/** Crea o actualiza la clase del negocio (se llama al crear/editar la tarjeta). */
export async function upsertClass(card) {
  if (!config.google.enabled) return { skipped: true };
  const cls = buildLoyaltyClass(card);
  const got = await gapi('GET', `/loyaltyClass/${cls.id}`);
  const res = got.status === 404
    ? await gapi('POST', '/loyaltyClass', cls)
    : await gapi('PATCH', `/loyaltyClass/${cls.id}`, cls);
  if (!res.ok) console.warn('[google] upsertClass', res.status, res.data);
  return { ok: res.ok, status: res.status };
}

/** Actualiza puntos/textos de un cliente. 404 = el cliente aún no guarda el pase. */
export async function patchObject(card, customer) {
  if (!config.google.enabled) return { skipped: true };
  const obj = buildLoyaltyObject(card, customer);
  const res = await gapi('PATCH', `/loyaltyObject/${obj.id}`, obj);
  if (!res.ok && res.status !== 404) console.warn('[google] patchObject', res.status, res.data);
  return { ok: res.ok, status: res.status };
}

/**
 * Notificación masiva: agrega un mensaje a la CLASE (llega a todos los
 * clientes que la guardaron). TEXT_AND_NOTIFY dispara la notificación push.
 * Límite de Google: ~3 notificaciones por pase cada 24 h.
 */
export async function addClassMessage(card, { title, text }) {
  if (!config.google.enabled) return { skipped: true };
  const start = new Date();
  const end = new Date(start.getTime() + 7 * 24 * 3600 * 1000);
  const res = await gapi('POST', `/loyaltyClass/${classId(card)}/addMessage`, {
    message: {
      id: `msg_${Date.now()}`,
      header: title,
      body: text,
      messageType: 'TEXT_AND_NOTIFY',
      displayInterval: { start: { date: start.toISOString() }, end: { date: end.toISOString() } },
    },
  });
  if (!res.ok) console.warn('[google] addMessage', res.status, res.data);
  return { ok: res.ok, status: res.status, error: res.ok ? undefined : res.data };
}
