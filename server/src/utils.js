/**
 * Utilidades compartidas: errores HTTP, validación, colores y tokens.
 */
import crypto from 'node:crypto';

/** Error con código HTTP; el manejador global lo convierte en JSON. */
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// ───────────── Tokens ─────────────
export const newId = () => crypto.randomUUID();
export const randomToken = (bytes = 24) => crypto.randomBytes(bytes).toString('hex');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** Comparación en tiempo constante para evitar ataques de timing. */
export function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// ───────────── Colores ─────────────
const HEX_RE = /^#?([0-9a-f]{6})$/i;

export function normalizeHex(hex) {
  const m = HEX_RE.exec(String(hex || '').trim());
  return m ? `#${m[1].toLowerCase()}` : null;
}

export function hexToRgb(hex) {
  const n = parseInt(normalizeHex(hex).slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Apple Wallet exige colores como "rgb(r, g, b)". */
export function hexToAppleRgb(hex) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Elige texto blanco o negro según la luminancia del fondo (WCAG). */
export function contrastText(hex) {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.4 ? '#111111' : '#ffffff';
}

// ───────────── Validación ─────────────
/**
 * Valida el cuerpo para crear/editar un negocio.
 * @param {object} body
 * @param {boolean} partial  true para PATCH (campos opcionales)
 */
export function validateBusiness(body = {}, partial = false) {
  const errors = {};
  const out = {};

  const str = (key, { min = 1, max = 120, required = !partial } = {}) => {
    const v = body[key];
    if (v === undefined || v === null || v === '') {
      if (required) errors[key] = 'Campo obligatorio';
      return;
    }
    if (typeof v !== 'string') return (errors[key] = 'Debe ser texto');
    const t = v.trim();
    if (t.length < min || t.length > max) return (errors[key] = `Entre ${min} y ${max} caracteres`);
    out[key] = t;
  };

  str('name', { max: 60 });
  str('rewardDescription', { max: 120 });
  str('phone', { min: 7, max: 25 });
  str('pointsLabel', { max: 20, required: false });

  if (out.phone && !/^[+\d\s()-]{7,25}$/.test(out.phone)) errors.phone = 'Teléfono inválido';

  if (body.color !== undefined || !partial) {
    const c = normalizeHex(body.color);
    if (!c) errors.color = 'Color hexadecimal inválido (ej. #e11d48)';
    else out.color = c;
  }

  if (body.rewardGoal !== undefined) {
    const g = Number(body.rewardGoal);
    if (!Number.isInteger(g) || g < 1 || g > 100) errors.rewardGoal = 'Entero entre 1 y 100';
    else out.rewardGoal = g;
  }

  // El logo llega como data URL (base64). Se procesa aparte en services/images.js
  if (body.logo !== undefined && body.logo !== null && body.logo !== '') {
    if (typeof body.logo !== 'string' || !body.logo.startsWith('data:image/')) {
      errors.logo = 'El logo debe ser una imagen en formato data URL';
    } else {
      out.logo = body.logo;
    }
  }

  if (Object.keys(errors).length) throw new HttpError(400, 'Datos inválidos', errors);
  return out;
}

/** Limpia el nombre del cliente que viene por query string. */
export function cleanCustomerName(raw) {
  const s = String(raw || '').trim().slice(0, 40);
  return s.replace(/[<>]/g, '') || 'Cliente';
}
