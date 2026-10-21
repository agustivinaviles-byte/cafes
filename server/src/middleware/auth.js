/**
 * Autenticación del panel del negocio.
 *
 * Al crear una tarjeta se entrega un `adminToken` (una sola vez). Guardamos solo
 * su hash SHA-256. El dashboard lo manda como:  Authorization: Bearer <token>
 *
 * En producción con varios usuarios por negocio, reemplaza esto por un sistema
 * de cuentas (Auth0, Clerk, Supabase Auth, etc.).
 */
import { getCard } from '../db.js';
import { HttpError, sha256, safeEqual } from '../utils.js';

export function requireBusiness(req, _res, next) {
  const cardId = req.params.cardId || req.body?.cardId;
  const card = cardId && getCard(cardId);
  if (!card) throw new HttpError(404, 'Tarjeta no encontrada');

  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token || !safeEqual(sha256(token), card.adminTokenHash)) {
    throw new HttpError(401, 'Token de administrador inválido');
  }
  req.card = card;
  next();
}
