/**
 * Generación del archivo .pkpass (Apple Wallet, tipo "storeCard").
 *
 * Construimos el pass.json completo nosotros y usamos passkit-generator solo
 * para empaquetar (manifest.json + firma PKCS#7 + zip). Así el formato queda
 * explícito y fácil de auditar.
 * Referencia: https://developer.apple.com/documentation/walletpasses/pass
 */
import { PKPass } from 'passkit-generator';
import { config } from '../config.js';
import { HttpError, hexToAppleRgb, contrastText } from '../utils.js';
import { appleImageBuffers, stripBuffers } from './images.js';

export const PKPASS_MIME = 'application/vnd.apple.pkpass';

/** Texto de progreso que se muestra en el pase. */
export function progressText(card, customer) {
  return customer.points >= card.rewardGoal
    ? '¡Recompensa lista! 🎉'
    : `${customer.points} de ${card.rewardGoal}`;
}

/** Construye el objeto pass.json para un cliente. */
export function buildPassJson(card, customer) {
  const fg = contrastText(card.color);
  const label = card.pointsLabel || 'Puntos';

  return {
    formatVersion: 1,
    passTypeIdentifier: config.apple.passTypeIdentifier,
    teamIdentifier: config.apple.teamIdentifier,
    serialNumber: customer.serial,
    organizationName: card.name,
    description: `Tarjeta de lealtad de ${card.name}`,
    logoText: card.name,

    backgroundColor: hexToAppleRgb(card.color),
    foregroundColor: hexToAppleRgb(fg),
    labelColor: hexToAppleRgb(fg),

    // Servicio web para actualizaciones push (ver routes/appleWebService.js)
    webServiceURL: config.apple.webServiceURL,
    authenticationToken: customer.authToken,

    // El negocio escanea este QR para acreditar puntos
    barcodes: [{
      format: 'PKBarcodeFormatQR',
      message: customer.serial,
      messageEncoding: 'iso-8859-1',
      altText: customer.serial.slice(0, 8).toUpperCase(),
    }],

    storeCard: {
      headerFields: [{
        key: 'points',
        label: label.toUpperCase(),
        value: customer.points,
        // Cuando cambia el valor, iOS muestra este texto en la pantalla de bloqueo
        changeMessage: `Ahora tienes %@ ${label.toLowerCase()}`,
      }],
      // Sin primaryFields: el área principal la ocupa la imagen strip con los sellos
      secondaryFields: [
        { key: 'progress', label: 'PROGRESO', value: progressText(card, customer) },
        { key: 'reward', label: 'RECOMPENSA', value: card.rewardDescription, textAlignment: 'PKTextAlignmentRight' },
      ],
      auxiliaryFields: [{
        key: 'customer',
        label: 'CLIENTE',
        value: customer.name,
      }],
      backFields: [
        {
          key: 'news',
          label: 'Novedades',
          value: card.lastMessage?.text || `¡Gracias por tu preferencia en ${card.name}!`,
          // Notificaciones masivas: al cambiar este campo, el iPhone avisa con el texto
          changeMessage: '%@',
        },
        {
          key: 'phone',
          label: 'Teléfono',
          value: card.phone,
          dataDetectorTypes: ['PKDataDetectorTypePhoneNumber'],
        },
        {
          key: 'how',
          label: '¿Cómo funciona?',
          value: `Muestra este código en cada compra. Al juntar ${card.rewardGoal} ${label.toLowerCase()} obtienes: ${card.rewardDescription}.`,
        },
      ],
    },
  };
}

/**
 * Genera el .pkpass firmado.
 * @returns {Promise<Buffer>}
 */
export async function generateApplePass(card, customer) {
  if (!config.apple.enabled) {
    throw new HttpError(
      503,
      'Apple Wallet no está configurado en el servidor',
      { hint: 'Configura APPLE_PASS_TYPE_ID, APPLE_TEAM_ID y los certificados en .env (ver README).' },
    );
  }

  const [images, strip] = await Promise.all([
    appleImageBuffers(card.id),
    stripBuffers(card, customer.points),
  ]);
  const passJson = buildPassJson(card, customer);

  try {
    const pass = new PKPass(
      { ...images, ...strip, 'pass.json': Buffer.from(JSON.stringify(passJson)) },
      config.apple.certificates,
    );
    return pass.getAsBuffer();
  } catch (err) {
    console.error('[apple] Error al firmar el pase:', err);
    throw new HttpError(500, 'No se pudo firmar el pase de Apple. Revisa los certificados.');
  }
}
