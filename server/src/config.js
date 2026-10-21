/**
 * Configuración central: lee variables de entorno y carga certificados.
 * Si faltan los certificados de Apple o Google, la plataforma correspondiente
 * queda "deshabilitada" y la API trabaja en modo simulado (no truena).
 */
import 'dotenv/config';
import fs from 'node:fs';
import { X509Certificate } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SERVER_ROOT = path.resolve(__dirname, '..');

/** Resuelve rutas relativas respecto a /server */
const resolvePath = (p) => (p ? path.resolve(SERVER_ROOT, p) : null);

/** Lee un archivo si existe; si no, devuelve null (sin lanzar). */
function readIfExists(p) {
  const abs = resolvePath(p);
  if (!abs || !fs.existsSync(abs)) return null;
  return fs.readFileSync(abs);
}

const env = process.env;
// Render define RENDER_EXTERNAL_URL (https://<servicio>.onrender.com) automáticamente
const publicUrl = env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || `http://localhost:${env.PORT || 3001}`;

export const config = {
  port: Number(env.PORT) || 3001,
  isProd: env.NODE_ENV === 'production',
  publicUrl: publicUrl.replace(/\/$/, ''),
  // Dónde vive el frontend (para el enlace/QR de inscripción). En producción = PUBLIC_URL.
  clientUrl: (env.CLIENT_URL || publicUrl).replace(/\/$/, ''),
  corsOrigins: (env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  dataDir: resolvePath(env.DATA_DIR || './data'),
  clientDist: path.resolve(SERVER_ROOT, '../client/dist'),
};

// ───────────── Apple ─────────────
const appleCerts = {
  wwdr: readIfExists(env.APPLE_WWDR_CERT),
  signerCert: readIfExists(env.APPLE_SIGNER_CERT),
  signerKey: readIfExists(env.APPLE_SIGNER_KEY),
  signerKeyPassphrase: env.APPLE_SIGNER_KEY_PASSPHRASE || undefined,
};

config.apple = {
  passTypeIdentifier: env.APPLE_PASS_TYPE_ID || '',
  teamIdentifier: env.APPLE_TEAM_ID || '',
  certificates: appleCerts,
  apnsHost: env.APPLE_APNS_SANDBOX === 'true'
    ? 'https://api.sandbox.push.apple.com'
    : 'https://api.push.apple.com',
  // Apple exige HTTPS para webServiceURL; en HTTP local las actualizaciones no llegan.
  webServiceURL: `${config.publicUrl}/wallet`,
  enabled: Boolean(
    env.APPLE_PASS_TYPE_ID && env.APPLE_TEAM_ID &&
    appleCerts.wwdr && appleCerts.signerCert && appleCerts.signerKey,
  ),
  // Certificados autofirmados de prueba: el .pkpass se genera, pero el iPhone lo rechaza
  demo: isDemoCert(appleCerts.signerCert),
};

function isDemoCert(pem) {
  if (!pem) return false;
  try {
    return !new X509Certificate(pem).issuer.includes('Apple Inc.');
  } catch {
    return false;
  }
}

// ───────────── Google ─────────────
let serviceAccount = null;
const saRaw = readIfExists(env.GOOGLE_SERVICE_ACCOUNT_FILE);
if (saRaw) {
  try {
    serviceAccount = JSON.parse(saRaw.toString('utf8'));
  } catch {
    console.warn('[config] GOOGLE_SERVICE_ACCOUNT_FILE no es un JSON válido');
  }
}

config.google = {
  issuerId: env.GOOGLE_ISSUER_ID || '',
  countryCode: env.GOOGLE_COUNTRY_CODE || 'MX',
  serviceAccount,
  enabled: Boolean(env.GOOGLE_ISSUER_ID && serviceAccount?.client_email && serviceAccount?.private_key),
};

export function logConfigSummary() {
  console.log(`[config] PUBLIC_URL = ${config.publicUrl}`);
  console.log(`[config] Apple Wallet:  ${config.apple.enabled ? (config.apple.demo ? 'ACTIVO en DEMO (certificados de prueba: el iPhone no aceptará el pase)' : 'ACTIVO') : 'modo simulado (faltan certificados)'}`);
  console.log(`[config] Google Wallet: ${config.google.enabled ? 'ACTIVO' : 'modo simulado (falta cuenta de servicio)'}`);
  if (config.apple.enabled && !config.publicUrl.startsWith('https://')) {
    console.warn('[config] ⚠ PUBLIC_URL no es HTTPS: los iPhone no registrarán el pase para actualizaciones push.');
  }
  if (config.google.enabled && !config.publicUrl.startsWith('https://')) {
    console.warn('[config] ⚠ PUBLIC_URL no es HTTPS público: Google no puede descargar el logo y el pase fallará al guardarse.');
  }
}
