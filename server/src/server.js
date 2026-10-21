/**
 * WalletPass Studio — servidor principal.
 *
 *   npm run dev     (recarga automática)
 *   npm start       (producción: también sirve el frontend compilado)
 */
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { config, logConfigSummary } from './config.js';
import { initDb, flushDb } from './db.js';
import { HttpError } from './utils.js';
import { businessRouter, publicRouter } from './routes/business.js';
import { loyaltyRouter } from './routes/loyalty.js';
import { passesRouter } from './routes/passes.js';
import { notificationsRouter } from './routes/notifications.js';
import { appleWebServiceRouter } from './routes/appleWebService.js';

initDb();
const app = express();

app.set('trust proxy', 1); // detrás de ngrok / Render / Railway / Nginx
app.disable('x-powered-by');

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin) || !config.isProd),
}));
// Los logos llegan en base64 dentro del JSON → límite de 3 MB
app.use(express.json({ limit: '3mb' }));

// ───────────── Rate limits ─────────────
const createLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });
const passLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false });

// ───────────── Rutas ─────────────
app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    apple: config.apple.enabled,
    google: config.google.enabled,
    missing: { apple: config.apple.missing, google: config.google.missing },
    secretFiles: config.secretFiles,
  }),
);

app.use('/api/business/create', createLimiter);
app.use('/api', apiLimiter);
app.use('/api/business', businessRouter);
app.use('/api/public', publicRouter);
app.use('/api/cards/:cardId/customers', loyaltyRouter);
app.use('/api/notifications', notificationsRouter);

app.use('/pass', passLimiter, passesRouter);
app.use('/wallet', appleWebServiceRouter);

// Logos procesados (Apple los empaqueta; Google los descarga por URL)
app.use('/assets', express.static(path.join(config.dataDir, 'assets'), { maxAge: '7d', fallthrough: false }));

// ───────────── Frontend compilado (producción) ─────────────
if (fs.existsSync(config.clientDist)) {
  app.use(express.static(config.clientDist));
  // SPA: cualquier ruta que no sea de API devuelve index.html
  app.get(/^(?!\/(api|pass|wallet|assets)\b).*/, (_req, res) =>
    res.sendFile(path.join(config.clientDist, 'index.html')),
  );
}

// ───────────── 404 y errores ─────────────
app.use((req, _res, next) => next(new HttpError(404, `Ruta no encontrada: ${req.method} ${req.path}`)));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  if (err.type === 'entity.too.large') err = new HttpError(413, 'La petición es demasiado grande');
  if (err.type === 'entity.parse.failed') err = new HttpError(400, 'JSON inválido');
  // express.static con fallthrough:false
  if (err.status === 404 && !(err instanceof HttpError)) err = new HttpError(404, 'Archivo no encontrado');

  const status = err.status || 500;
  if (status >= 500) console.error(`[error] ${req.method} ${req.originalUrl}`, err);
  res.status(status).json({
    error: status >= 500 && !(err instanceof HttpError) ? 'Error interno del servidor' : err.message,
    ...(err.details ? { details: err.details } : {}),
  });
});

// ───────────── Arranque ─────────────
const server = app.listen(config.port, () => {
  console.log(`\n🚀 WalletPass Studio API en http://localhost:${config.port}`);
  logConfigSummary();
});

// Cierre ordenado: termina escrituras pendientes de la BD
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    console.log(`\n${signal} recibido, cerrando…`);
    server.close();
    await flushDb();
    process.exit(0);
  });
}

export default app;
