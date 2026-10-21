/**
 * Emisión de pases a clientes finales (sin app: desde el navegador del celular).
 *
 *  GET /pass/apple/:cardId?name=Ana          → descarga el .pkpass (abre Apple Wallet)
 *  GET /pass/google/:cardId?name=Ana         → { saveUrl }  enlace "Agregar a Google Wallet"
 *  GET /pass/google/:cardId?redirect=1       → redirige directo a Google Wallet
 *
 * Cada llamada emite un pase NUEVO (un cliente nuevo con su propio serial/QR).
 */
import { Router } from 'express';
import * as db from '../db.js';
import { generateApplePass, PKPASS_MIME } from '../services/applePass.js';
import { createSaveUrl } from '../services/googleWallet.js';
import { HttpError, cleanCustomerName, newId, randomToken } from '../utils.js';

export const passesRouter = Router();

function loadCard(cardId) {
  const card = db.getCard(cardId);
  if (!card) throw new HttpError(404, 'Tarjeta no encontrada');
  return card;
}

function newCustomer(card, platform, name) {
  const now = new Date().toISOString();
  return {
    serial: newId(),
    cardId: card.id,
    platform,
    name: cleanCustomerName(name),
    points: 0,
    lifetimePoints: 0,
    rewardsRedeemed: 0,
    authToken: randomToken(20), // Apple exige ≥16 caracteres
    createdAt: now,
    updatedAt: now,
    lastVisitAt: null,
  };
}

passesRouter.get('/apple/:cardId', async (req, res) => {
  const card = loadCard(req.params.cardId);
  const customer = newCustomer(card, 'apple', req.query.name);

  // Primero generamos; solo guardamos al cliente si el pase se firmó bien.
  const buffer = await generateApplePass(card, customer);
  await db.saveCustomer(customer);

  const filename = `${card.name.replace(/[^\w-]+/g, '_').slice(0, 40) || 'tarjeta'}.pkpass`;
  res.set({
    'Content-Type': PKPASS_MIME,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': buffer.length,
    'Last-Modified': new Date(customer.updatedAt).toUTCString(),
    'Cache-Control': 'no-store',
  });
  res.send(buffer);
});

passesRouter.get('/google/:cardId', async (req, res) => {
  const card = loadCard(req.params.cardId);
  const customer = newCustomer(card, 'google', req.query.name);

  const saveUrl = await createSaveUrl(card, customer); // lanza 503 si no está configurado
  await db.saveCustomer(customer);

  if (req.query.redirect === '1') return res.redirect(302, saveUrl);
  res.json({ saveUrl, serial: customer.serial });
});
