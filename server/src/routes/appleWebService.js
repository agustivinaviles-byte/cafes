/**
 * Servicio web de Apple Wallet (lo llama el iPhone, no el frontend).
 * Montado en  {PUBLIC_URL}/wallet  =  webServiceURL del pass.json
 *
 * Especificación: https://developer.apple.com/documentation/walletpasses/adding-a-web-service-to-update-passes
 *
 *  POST   /v1/devices/:deviceId/registrations/:passTypeId/:serial   → registrar dispositivo (push token)
 *  GET    /v1/devices/:deviceId/registrations/:passTypeId           → seriales con cambios
 *  GET    /v1/passes/:passTypeId/:serial                            → descargar pase actualizado
 *  DELETE /v1/devices/:deviceId/registrations/:passTypeId/:serial   → el usuario borró el pase
 *  POST   /v1/log                                                    → errores que reporta el iPhone
 */
import { Router } from 'express';
import { config } from '../config.js';
import * as db from '../db.js';
import { generateApplePass, PKPASS_MIME } from '../services/applePass.js';
import { safeEqual } from '../utils.js';

export const appleWebServiceRouter = Router();

/** Valida "Authorization: ApplePass <authenticationToken>" contra el pase. */
function authorizePass(req, res) {
  const { passTypeId, serial } = req.params;
  if (passTypeId !== config.apple.passTypeIdentifier) {
    res.sendStatus(404);
    return null;
  }
  const customer = db.getCustomer(serial);
  const header = req.get('authorization') || '';
  const token = header.startsWith('ApplePass ') ? header.slice(10).trim() : '';
  if (!customer || customer.platform !== 'apple' || !token || !safeEqual(token, customer.authToken)) {
    res.sendStatus(401);
    return null;
  }
  return customer;
}

// Registrar dispositivo
appleWebServiceRouter.post('/v1/devices/:deviceId/registrations/:passTypeId/:serial', async (req, res) => {
  const customer = authorizePass(req, res);
  if (!customer) return;
  const pushToken = req.body?.pushToken;
  if (!pushToken || typeof pushToken !== 'string') return res.sendStatus(400);

  const { created } = await db.addRegistration({
    deviceLibraryIdentifier: req.params.deviceId,
    passTypeIdentifier: req.params.passTypeId,
    serial: customer.serial,
    pushToken,
  });
  res.sendStatus(created ? 201 : 200);
});

// Seriales actualizados para un dispositivo
appleWebServiceRouter.get('/v1/devices/:deviceId/registrations/:passTypeId', (req, res) => {
  const since = Number(req.query.passesUpdatedSince) || 0;
  const regs = db.registrationsForDevice(req.params.deviceId, req.params.passTypeId);
  if (!regs.length) return res.sendStatus(404);

  let lastUpdated = since;
  const serialNumbers = [];
  for (const r of regs) {
    const c = db.getCustomer(r.serial);
    if (!c) continue;
    const ts = Date.parse(c.updatedAt);
    if (ts > since) serialNumbers.push(c.serial);
    lastUpdated = Math.max(lastUpdated, ts);
  }
  if (!serialNumbers.length) return res.sendStatus(204);
  res.json({ serialNumbers, lastUpdated: String(lastUpdated) });
});

// Descargar la versión más reciente del pase
appleWebServiceRouter.get('/v1/passes/:passTypeId/:serial', async (req, res) => {
  const customer = authorizePass(req, res);
  if (!customer) return;
  const card = db.getCard(customer.cardId);
  if (!card) return res.sendStatus(404);

  const updatedAt = new Date(customer.updatedAt);
  const ifModifiedSince = req.get('if-modified-since');
  // HTTP solo tiene precisión de segundos
  if (ifModifiedSince && Math.floor(updatedAt.getTime() / 1000) <= Math.floor(Date.parse(ifModifiedSince) / 1000)) {
    return res.sendStatus(304);
  }

  const buffer = await generateApplePass(card, customer);
  res.set({
    'Content-Type': PKPASS_MIME,
    'Last-Modified': updatedAt.toUTCString(),
    'Cache-Control': 'no-cache',
  });
  res.send(buffer);
});

// Dar de baja un dispositivo
appleWebServiceRouter.delete('/v1/devices/:deviceId/registrations/:passTypeId/:serial', async (req, res) => {
  const customer = authorizePass(req, res);
  if (!customer) return;
  await db.removeRegistration(req.params.deviceId, customer.serial);
  res.sendStatus(200);
});

// Logs de error del iPhone (muy útiles para depurar firmas o URLs)
appleWebServiceRouter.post('/v1/log', (req, res) => {
  for (const line of req.body?.logs || []) console.warn('[apple-device]', line);
  res.sendStatus(200);
});
