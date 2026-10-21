/**
 *  POST /api/notifications/send
 *  Headers: Authorization: Bearer <adminToken>
 *  Body:    { cardId, title?, message }
 *
 * Envía una notificación masiva a todas las tarjetas instaladas del negocio.
 * Si Apple/Google no están configurados, se SIMULA (se registra en el historial
 * con `simulated: true`) para poder probar el flujo completo en local.
 */
import { Router } from 'express';
import { requireBusiness } from '../middleware/auth.js';
import { broadcast } from '../services/notifier.js';
import { HttpError } from '../utils.js';

export const notificationsRouter = Router();

notificationsRouter.post('/send', requireBusiness, async (req, res) => {
  const text = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  const title = (typeof req.body?.title === 'string' && req.body.title.trim()) || req.card.name;

  if (text.length < 3 || text.length > 180) {
    throw new HttpError(400, 'El mensaje debe tener entre 3 y 180 caracteres');
  }
  // Apple solo notifica si el texto CAMBIA respecto al anterior
  if (req.card.lastMessage?.text === text) {
    throw new HttpError(409, 'Es idéntico al último mensaje; cámbialo para que llegue la notificación');
  }

  const entry = await broadcast(req.card, { title: title.slice(0, 60), text });
  res.status(202).json({ notification: entry });
});
