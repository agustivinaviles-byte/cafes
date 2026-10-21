/**
 * Rutas de negocios (creación y gestión de la tarjeta).
 *
 *  POST  /api/business/create            → crea negocio + tarjeta (público, con rate limit)
 *  GET   /api/business/:cardId           → datos de la tarjeta           (token)
 *  PATCH /api/business/:cardId           → edita diseño/textos y actualiza pases instalados (token)
 *  GET   /api/business/:cardId/stats     → métricas, clientes y notificaciones (token)
 *  GET   /api/public/cards/:cardId       → datos públicos para la página de inscripción
 */
import { Router } from 'express';
import { config } from '../config.js';
import * as db from '../db.js';
import { requireBusiness } from '../middleware/auth.js';
import { processLogo } from '../services/images.js';
import { upsertClass } from '../services/googleWallet.js';
import { pushPassUpdates } from '../services/notifier.js';
import { HttpError, newId, randomToken, sha256, validateBusiness } from '../utils.js';

export const businessRouter = Router();
export const publicRouter = Router();

/** Representación pública (nunca exponer el hash del token). */
export function serializeCard(card) {
  const { adminTokenHash, ...rest } = card;
  const v = encodeURIComponent(card.updatedAt);
  return {
    ...rest,
    logoUrl: `/assets/${card.id}/logo-square.png?v=${v}`,
    headerLogoUrl: `/assets/${card.id}/logo@3x.png?v=${v}`,
    enrollUrl: `${config.clientUrl}/c/${card.id}`,
    platforms: {
      apple: config.apple.enabled,
      // Certificados de prueba: el frontend muestra una vista previa en vez de descargar
      appleDemo: config.apple.enabled && config.apple.demo,
      google: config.google.enabled,
    },
  };
}

// ───────────── Crear ─────────────
businessRouter.post('/create', async (req, res) => {
  const input = validateBusiness(req.body);
  const now = new Date().toISOString();
  const adminToken = randomToken();

  const card = {
    id: newId(),
    name: input.name,
    rewardDescription: input.rewardDescription,
    phone: input.phone,
    color: input.color,
    pointsLabel: input.pointsLabel || 'Sellos',
    rewardGoal: input.rewardGoal || 10,
    hasCustomLogo: false,
    lastMessage: null,
    adminTokenHash: sha256(adminToken),
    createdAt: now,
    updatedAt: now,
  };

  card.hasCustomLogo = await processLogo(card.id, { logo: input.logo, name: card.name, color: card.color });
  await db.saveCard(card);

  // Registrar la clase en Google en segundo plano (si falla, el JWT la crea igual)
  upsertClass(card).catch((err) => console.warn('[google] upsertClass:', err.message));

  res.status(201).json({
    card: serializeCard(card),
    // ⚠ Solo se muestra una vez. El frontend lo guarda en localStorage.
    adminToken,
  });
});

// ───────────── Leer ─────────────
businessRouter.get('/:cardId', requireBusiness, (req, res) => {
  res.json({ card: serializeCard(req.card) });
});

// ───────────── Editar ─────────────
businessRouter.patch('/:cardId', requireBusiness, async (req, res) => {
  const input = validateBusiness(req.body, true);
  const card = req.card;
  const { logo, ...fields } = input;

  Object.assign(card, fields);
  card.updatedAt = new Date().toISOString();

  if (logo || fields.color || fields.name) {
    // Regenerar logos si cambió el logo, o si se usa el logo por defecto (inicial + color)
    if (logo || !card.hasCustomLogo) {
      card.hasCustomLogo = await processLogo(card.id, { logo, name: card.name, color: card.color }) || card.hasCustomLogo;
    }
  }
  await db.saveCard(card);

  upsertClass(card).catch((err) => console.warn('[google] upsertClass:', err.message));
  // Los pases ya instalados se actualizan solos con el nuevo diseño
  const updates = await pushPassUpdates(card, db.listCustomers(card.id));

  res.json({ card: serializeCard(card), updates });
});

// ───────────── Estadísticas ─────────────
businessRouter.get('/:cardId/stats', requireBusiness, (req, res) => {
  const customers = db.listCustomers(req.card.id);
  const appleSerials = customers.filter((c) => c.platform === 'apple').map((c) => c.serial);
  const appleDevices = new Set(db.registrationsForSerials(appleSerials).map((r) => r.serial));

  res.json({
    totals: {
      issued: customers.length,
      apple: appleSerials.length,
      // Apple confirma la instalación cuando el iPhone registra el pase (requiere HTTPS)
      appleInstalled: appleDevices.size,
      google: customers.length - appleSerials.length,
      pointsGiven: customers.reduce((s, c) => s + c.lifetimePoints, 0),
      rewardsRedeemed: customers.reduce((s, c) => s + c.rewardsRedeemed, 0),
      readyToRedeem: customers.filter((c) => c.points >= req.card.rewardGoal).length,
    },
    customers: customers.slice(0, 100).map(({ authToken, ...c }) => c),
    notifications: db.listNotifications(req.card.id),
  });
});

// ───────────── Público ─────────────
publicRouter.get('/cards/:cardId', (req, res) => {
  const card = db.getCard(req.params.cardId);
  if (!card) throw new HttpError(404, 'Tarjeta no encontrada');
  const { lastMessage, ...pub } = serializeCard(card);
  res.json({ card: pub });
});
