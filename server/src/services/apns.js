/**
 * Push a Apple Wallet vía APNs (HTTP/2) usando el MISMO certificado del Pass Type ID.
 *
 * Para pases de Wallet el push va vacío ("{}"): solo le avisa al iPhone que
 * hay cambios. El iPhone entonces consulta nuestro servicio web, descarga el
 * pase actualizado y muestra el `changeMessage` del campo que cambió.
 */
import http2 from 'node:http2';
import { config } from '../config.js';
import { removePushToken } from '../db.js';

/**
 * Envía un push a varios tokens. Devuelve un resumen { sent, failed, removed }.
 * @param {string[]} pushTokens
 */
export async function sendWalletPushes(pushTokens) {
  const tokens = [...new Set(pushTokens)];
  const summary = { sent: 0, failed: 0, removed: 0 };
  if (!tokens.length || !config.apple.enabled) return summary;

  const { signerCert, signerKey, signerKeyPassphrase } = config.apple.certificates;

  let client;
  try {
    client = http2.connect(config.apple.apnsHost, {
      cert: signerCert,
      key: signerKey,
      passphrase: signerKeyPassphrase,
    });
  } catch (err) {
    console.error('[apns] No se pudo conectar:', err.message);
    summary.failed = tokens.length;
    return summary;
  }
  client.on('error', (err) => console.error('[apns] Error de sesión:', err.message));

  const sendOne = (token) =>
    new Promise((resolve) => {
      const req = client.request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        'apns-topic': config.apple.passTypeIdentifier,
        'content-type': 'application/json',
      });
      let status = 0;
      let body = '';
      req.setTimeout(10_000, () => req.close(http2.constants.NGHTTP2_CANCEL));
      req.on('response', (headers) => (status = headers[':status']));
      req.on('data', (chunk) => (body += chunk));
      req.on('error', () => resolve({ token, status: 0 }));
      req.on('close', () => resolve({ token, status, body }));
      req.end('{}');
    });

  // Lotes de 50 para no saturar la conexión
  for (let i = 0; i < tokens.length; i += 50) {
    const results = await Promise.all(tokens.slice(i, i + 50).map(sendOne));
    for (const r of results) {
      if (r.status === 200) summary.sent++;
      else {
        summary.failed++;
        // 410 = el usuario eliminó el pase; limpiamos el registro
        if (r.status === 410) {
          await removePushToken(r.token);
          summary.removed++;
        } else {
          console.warn(`[apns] ${r.status} para ${r.token.slice(0, 8)}…: ${r.body}`);
        }
      }
    }
  }

  client.close();
  return summary;
}
