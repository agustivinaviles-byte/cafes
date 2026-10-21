/**
 * Procesamiento de logos con sharp.
 *
 * A partir del logo que sube el negocio (PNG/JPG/WebP/SVG en data URL) genera:
 *  - Apple:  icon.png (29px) @2x @3x  y  logo.png (máx 160×50) @2x @3x
 *  - Google: logo-square.png 660×660 (Google lo recorta en círculo)
 * Si no hay logo, se genera uno con la inicial del negocio.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { config } from '../config.js';
import { HttpError, contrastText } from '../utils.js';

const MAX_LOGO_BYTES = 2 * 1024 * 1024; // 2 MB

export const assetsDir = (cardId) => path.join(config.dataDir, 'assets', cardId);

/** Convierte un data URL a Buffer validando tamaño. */
function dataUrlToBuffer(dataUrl) {
  const m = /^data:image\/[\w.+-]+;base64,(.+)$/s.exec(dataUrl);
  if (!m) throw new HttpError(400, 'Logo inválido: se esperaba base64');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > MAX_LOGO_BYTES) throw new HttpError(413, 'El logo supera 2 MB');
  return buf;
}

/** Logo de respaldo: círculo con la inicial del negocio. */
function initialsSvg(name, color) {
  const letter = (name.trim()[0] || '?').toUpperCase().replace(/[<>&"]/g, '');
  const fg = contrastText(color);
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="660" height="660">
      <rect width="660" height="660" rx="330" fill="${color}"/>
      <text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
            font-size="340" font-weight="700" fill="${fg}">${letter}</text>
    </svg>`,
  );
}

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };

/**
 * Genera y guarda todos los tamaños. Devuelve true si se usó un logo subido.
 * @param {string} cardId
 * @param {{logo?: string, name: string, color: string}} input
 */
export async function processLogo(cardId, { logo, name, color }) {
  const dir = assetsDir(cardId);
  let source;
  try {
    source = logo ? dataUrlToBuffer(logo) : initialsSvg(name, color);
    // Normaliza a PNG grande una sola vez (valida que sea imagen real)
    source = await sharp(source, { limitInputPixels: 40_000_000 }).png().toBuffer();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, 'No se pudo leer la imagen del logo');
  }
  await fs.promises.mkdir(dir, { recursive: true });

  const jobs = [];
  // Apple: icono (cuadrado)
  for (const [file, size] of [['icon.png', 29], ['icon@2x.png', 58], ['icon@3x.png', 87]]) {
    jobs.push(
      sharp(source).resize(size, size, { fit: 'contain', background: transparent }).png().toFile(path.join(dir, file)),
    );
  }
  // Apple: logo de cabecera (rectangular, máx 160×50 pt)
  for (const [file, scale] of [['logo.png', 1], ['logo@2x.png', 2], ['logo@3x.png', 3]]) {
    jobs.push(
      sharp(source)
        .resize(160 * scale, 50 * scale, { fit: 'inside', withoutEnlargement: false })
        .png()
        .toFile(path.join(dir, file)),
    );
  }
  // Google: logo cuadrado 660×660 con fondo blanco (Google no admite transparencias bien)
  jobs.push(
    sharp(source)
      .resize(560, 560, { fit: 'contain', background: transparent })
      .extend({ top: 50, bottom: 50, left: 50, right: 50, background: transparent })
      .flatten({ background: '#ffffff' })
      .png()
      .toFile(path.join(dir, 'logo-square.png')),
  );

  await Promise.all(jobs);
  return Boolean(logo);
}

/** Lee las imágenes de Apple como buffers para el .pkpass */
export async function appleImageBuffers(cardId) {
  const dir = assetsDir(cardId);
  const files = ['icon.png', 'icon@2x.png', 'icon@3x.png', 'logo.png', 'logo@2x.png', 'logo@3x.png'];
  const entries = await Promise.all(
    files.map(async (f) => [f, await fs.promises.readFile(path.join(dir, f))]),
  );
  return Object.fromEntries(entries);
}

/**
 * Imagen "strip" de Apple con los sellos (círculos llenos/vacíos).
 * Se regenera en cada descarga del pase porque depende de los puntos.
 * Tamaño Apple para storeCard: 375×123 pt (@1x, @2x, @3x).
 */
export async function stripBuffers(card, points) {
  const W = 1125, H = 369; // @3x
  const goal = card.rewardGoal;
  const fg = contrastText(card.color);
  let shapes = '';

  if (goal <= 20) {
    const rows = goal > 10 ? 2 : 1;
    const perRow = Math.ceil(goal / rows);
    const gap = 24;
    const size = Math.min(110, (W - 120 - gap * (perRow - 1)) / perRow, (H - 80 - gap * (rows - 1)) / rows);
    const r = size / 2;
    const totalH = rows * size + (rows - 1) * gap;
    for (let i = 0; i < goal; i++) {
      const row = Math.floor(i / perRow);
      const inRow = row === rows - 1 ? goal - perRow * (rows - 1) : perRow;
      const col = i % perRow;
      const rowW = inRow * size + (inRow - 1) * gap;
      const cx = (W - rowW) / 2 + col * (size + gap) + r;
      const cy = (H - totalH) / 2 + row * (size + gap) + r;
      const filled = i < points;
      shapes += `<circle cx="${cx}" cy="${cy}" r="${r - 4}" fill="${filled ? fg : 'none'}"
                  fill-opacity="${filled ? 0.95 : 0}" stroke="${fg}" stroke-opacity="${filled ? 1 : 0.45}" stroke-width="6"/>`;
      if (filled) {
        shapes += `<path d="M ${cx - r * 0.35} ${cy} l ${r * 0.25} ${r * 0.25} l ${r * 0.45} ${-r * 0.5}"
                    fill="none" stroke="${card.color}" stroke-width="${Math.max(6, r * 0.14)}" stroke-linecap="round" stroke-linejoin="round"/>`;
      }
    }
  } else {
    // Metas grandes: barra de progreso
    const pct = Math.min(1, points / goal);
    shapes = `<rect x="80" y="${H / 2 - 30}" width="${W - 160}" height="60" rx="30" fill="${fg}" fill-opacity="0.25"/>
              <rect x="80" y="${H / 2 - 30}" width="${Math.max(60, (W - 160) * pct)}" height="60" rx="30" fill="${fg}"/>`;
  }

  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
       <rect width="${W}" height="${H}" fill="${card.color}"/>
       <rect width="${W}" height="${H}" fill="#000" fill-opacity="0.12"/>
       ${shapes}
     </svg>`,
  );
  const big = await sharp(svg).png().toBuffer();
  const [s1, s2] = await Promise.all([
    sharp(big).resize(375, 123).png().toBuffer(),
    sharp(big).resize(750, 246).png().toBuffer(),
  ]);
  return { 'strip.png': s1, 'strip@2x.png': s2, 'strip@3x.png': big };
}

/** URL pública del logo (Google la descarga desde aquí, debe ser HTTPS). */
export const publicLogoUrl = (card) =>
  `${config.publicUrl}/assets/${card.id}/logo-square.png?v=${encodeURIComponent(card.updatedAt)}`;
