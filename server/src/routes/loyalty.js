/**
 * Acreditar y canjear puntos (lo usa el escáner del dashboard).
 *
 *  GET  /api/cards/:cardId/customers/:serial          → ver cliente escaneado
 *  POST /api/cards/:cardId/customers/:serial/points   → { delta: 1 }  suma (o resta) puntos
 *  POST /api/cards/:cardId/customers/:serial/redeem   → canjea la recompensa
 */
import { Router } from 'express';
import * as db from '../db.js';
import { requireBusiness } from '../middleware/auth.js';
import { pushPassUpdates } from '../services/notifier.js';
import { HttpError } from '../utils.js';

export const loyaltyRouter = Router({ mergeParams: true });

/** Carga el cliente y verifica que pertenezca a esta tarjeta. */
function loadCustomer(req) {
  const serial = String(req.params.serial || '').trim();
  const customer = db.getCustomer(serial);
  if (!customer || customer.cardId !== req.card.id) {
    throw new HttpError(404, 'Este código no pertenece a tu tarjeta');
  }
  return customer;
}

const publicCustomer = ({ authToken, ...c }) => c;

loyaltyRouter.get('/:serial', requireBusiness, (req, res) => {
  res.json({ customer: publicCustomer(loadCustomer(req)) });
});

loyaltyRouter.post('/:serial/points', requireBusiness, async (req, res) => {
  const customer = loadCustomer(req);
  const delta = Number(req.body?.delta ?? 1);
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100) {
    throw new HttpError(400, 'delta debe ser un entero entre -100 y 100 (distinto de 0)');
  }

  customer.points = Math.max(0, customer.points + delta);
  if (delta > 0) customer.lifetimePoints += delta;
  customer.lastVisitAt = new Date().toISOString();
  customer.updatedAt = customer.lastVisitAt;
  await db.saveCustomer(customer);

  const sync = await pushPassUpdates(req.card, [customer]);
  res.json({
    customer: publicCustomer(customer),
    rewardReady: customer.points >= req.card.rewardGoal,
    sync,
  });
});

loyaltyRouter.post('/:serial/redeem', requireBusiness, async (req, res) => {
  const customer = loadCustomer(req);
  if (customer.points < req.card.rewardGoal) {
    throw new HttpError(409, `Faltan ${req.card.rewardGoal - customer.points} para la recompensa`);
  }
  customer.points -= req.card.rewardGoal;
  customer.rewardsRedeemed += 1;
  customer.updatedAt = new Date().toISOString();
  await db.saveCustomer(customer);

  const sync = await pushPassUpdates(req.card, [customer]);
  res.json({ customer: publicCustomer(customer), sync });
});
