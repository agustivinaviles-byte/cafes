/**
 * Orquesta las actualizaciones hacia ambas carteras.
 * Las rutas llaman a estas funciones y no necesitan saber cómo funciona cada plataforma.
 */
import { config } from '../config.js';
import * as db from '../db.js';
import { sendWalletPushes } from './apns.js';
import * as google from './googleWallet.js';

/**
 * Avisa a los dispositivos que ciertos pases cambiaron (puntos, colores, mensaje).
 * @param {object} card
 * @param {object[]} customers
 */
export async function pushPassUpdates(card, customers) {
  const apple = customers.filter((c) => c.platform === 'apple');
  const googleCustomers = customers.filter((c) => c.platform === 'google');

  // Apple: actualizamos el "tag" y mandamos push vacío a cada dispositivo registrado
  await db.touchCustomers(apple.map((c) => c.serial));
  const tokens = db.registrationsForSerials(apple.map((c) => c.serial)).map((r) => r.pushToken);
  const appleResult = config.apple.enabled
    ? await sendWalletPushes(tokens)
    : { simulated: true, devices: tokens.length };

  // Google: PATCH a cada objeto (en paralelo, de 10 en 10)
  let googleResult = { simulated: true, passes: googleCustomers.length };
  if (config.google.enabled) {
    googleResult = { updated: 0, notSaved: 0, failed: 0 };
    for (let i = 0; i < googleCustomers.length; i += 10) {
      const batch = await Promise.allSettled(
        googleCustomers.slice(i, i + 10).map((c) => google.patchObject(card, c)),
      );
      for (const r of batch) {
        if (r.status === 'fulfilled' && r.value.ok) googleResult.updated++;
        else if (r.status === 'fulfilled' && r.value.status === 404) googleResult.notSaved++;
        else googleResult.failed++;
      }
    }
  }

  return { apple: appleResult, google: googleResult };
}

/**
 * Notificación masiva a la pantalla de bloqueo.
 *  - Apple: cambia el campo "Novedades" (changeMessage "%@") + push → iOS muestra el texto.
 *  - Google: addMessage TEXT_AND_NOTIFY en la clase.
 */
export async function broadcast(card, { title, text }) {
  card.lastMessage = { title, text, sentAt: new Date().toISOString() };
  card.updatedAt = card.lastMessage.sentAt;
  await db.saveCard(card);

  const customers = db.listCustomers(card.id);
  const results = await pushPassUpdates(card, customers);

  if (config.google.enabled) {
    results.googleMessage = await google.addClassMessage(card, { title, text });
  }

  const entry = {
    id: `n_${Date.now()}`,
    cardId: card.id,
    title,
    text,
    sentAt: card.lastMessage.sentAt,
    audience: customers.length,
    simulated: !config.apple.enabled && !config.google.enabled,
    results,
  };
  await db.addNotification(entry);
  return entry;
}
