# WalletPass Studio

Plataforma SaaS para que cualquier negocio cree su **tarjeta de lealtad digital** y sus clientes la guarden en **Apple Wallet** o **Google Wallet** desde un enlace o QR, sin descargar ninguna app.

```
walletpass-studio/
├── package.json              ← workspaces + scripts (dev / build / start)
├── server/                   ← API Node.js + Express
│   ├── .env.example
│   ├── certs/                ← aquí van tus certificados (ignorados por git)
│   └── src/
│       ├── server.js         ← arranque, middlewares, manejo de errores
│       ├── config.js         ← variables de entorno + carga de certificados
│       ├── db.js             ← "BD" JSON con escritura atómica (cambiable por Postgres)
│       ├── utils.js          ← validación, colores, tokens
│       ├── middleware/auth.js
│       ├── routes/
│       │   ├── business.js         POST /api/business/create, GET/PATCH, stats
│       │   ├── passes.js           GET /pass/apple/:cardId, GET /pass/google/:cardId
│       │   ├── notifications.js    POST /api/notifications/send
│       │   ├── loyalty.js          acreditar puntos / canjear (escáner)
│       │   └── appleWebService.js  servicio web que llama el iPhone (actualizaciones)
│       └── services/
│           ├── applePass.js    genera y firma el .pkpass
│           ├── apns.js         push HTTP/2 a Apple
│           ├── googleWallet.js JWT "Guardar en Google Wallet" + REST API
│           ├── images.js       logos e imagen de sellos con sharp
│           └── notifier.js     orquesta actualizaciones en ambas carteras
└── client/                   ← React + Vite + Tailwind CSS v4
    └── src/
        ├── views/Creator.jsx    Vista 1: creador con vista previa en vivo
        ├── views/Dashboard.jsx  Vista 2: métricas, escáner, notificación masiva, QR
        ├── views/Enroll.jsx     página pública /c/:cardId para el cliente final
        └── components/          PassPreview (iPhone/Android), Scanner (cámara)
```

## Arranque rápido

```bash
npm install                      # instala server + client (workspaces)
cp server/.env.example server/.env
npm run dev                      # API en :3001, panel en http://localhost:5173
```

Sin certificados la app funciona en **modo simulado**: puedes crear tarjetas, ver la vista previa, acreditar puntos y "enviar" notificaciones (quedan en el historial como simuladas). Las descargas reales de pases responden `503` con una pista de qué falta.

**Producción** (un solo proceso sirve API + frontend):

```bash
npm run build && NODE_ENV=production npm start
```

## Cómo funciona

| Paso | Qué pasa |
|---|---|
| 1. El negocio crea su tarjeta | `POST /api/business/create` guarda el negocio, procesa el logo y devuelve una **clave de administrador** (solo se muestra una vez). |
| 2. Pone el QR en el mostrador | El QR apunta a `/c/:cardId`. El cliente elige Apple o Google. |
| 3. El cliente guarda la tarjeta | iPhone: `GET /pass/apple/:cardId` descarga el `.pkpass`. Android: `GET /pass/google/:cardId` devuelve el enlace `pay.google.com/gp/v/save/<JWT>`. Cada pase tiene su propio QR (serial). |
| 4. En cada compra | El negocio escanea el QR del pase desde el panel → `POST /api/cards/:cardId/customers/:serial/points`. El pase se actualiza solo en el teléfono del cliente. |
| 5. Promociones | `POST /api/notifications/send` → aparece en la pantalla de bloqueo. |

### Sobre las notificaciones push (importante)

Ninguna de las dos carteras permite mandar push con texto libre como una app:

- **Apple:** el servidor cambia el campo *Novedades* del pase (que tiene `changeMessage: "%@"`) y manda un push **vacío** por APNs. El iPhone descarga el pase actualizado y muestra el texto nuevo en la pantalla de bloqueo. Por eso un mensaje idéntico al anterior se rechaza (409): sin cambio, no hay notificación.
- **Google:** se usa `loyaltyClass.addMessage` con `TEXT_AND_NOTIFY`. Google limita estas notificaciones (aprox. 3 por pase cada 24 h); por encima de eso el mensaje se agrega al pase sin sonar.
- Para que Apple registre el dispositivo, `PUBLIC_URL` **debe ser HTTPS**.

### Referencia de la API

Las rutas marcadas con 🔒 requieren `Authorization: Bearer <adminToken>`.

| Método | Ruta | Cuerpo / query |
|---|---|---|
| POST | `/api/business/create` | `{ name, logo (data URL), color "#hex", rewardDescription, phone, pointsLabel?, rewardGoal? }` |
| GET 🔒 | `/api/business/:cardId` | |
| PATCH 🔒 | `/api/business/:cardId` | mismos campos, opcionales; actualiza todos los pases instalados |
| GET 🔒 | `/api/business/:cardId/stats` | métricas, clientes, historial de notificaciones |
| GET | `/pass/apple/:cardId` | `?name=Ana` → descarga `.pkpass` |
| GET | `/pass/google/:cardId` | `?name=Ana` → `{ saveUrl }`; con `&redirect=1` redirige |
| POST 🔒 | `/api/notifications/send` | `{ cardId, title?, message }` |
| GET 🔒 | `/api/cards/:cardId/customers/:serial` | cliente escaneado |
| POST 🔒 | `/api/cards/:cardId/customers/:serial/points` | `{ delta: 1 }` |
| POST 🔒 | `/api/cards/:cardId/customers/:serial/redeem` | |
| — | `/wallet/v1/...` | servicio web de Apple (lo llama el iPhone) |

---

## Guía de implementación

### 1. Certificados de Apple Wallet

Necesitas una cuenta del **Apple Developer Program** (99 USD/año). Un `.pkpass` sin firma válida no abre en el iPhone.

**a) Crear el Pass Type ID**
1. Entra a [developer.apple.com/account](https://developer.apple.com/account) → *Certificates, Identifiers & Profiles* → *Identifiers* → **+**.
2. Elige **Pass Type IDs** y crea uno, p. ej. `pass.com.tunegocio.loyalty`. Eso va en `APPLE_PASS_TYPE_ID`.
3. Tu **Team ID** (10 caracteres) está en *Membership details*. Va en `APPLE_TEAM_ID`.

**b) Generar llave privada y CSR** (desde la carpeta `server/certs`)
```bash
openssl genrsa -out signerKey.pem 2048
openssl req -new -key signerKey.pem -out request.csr \
  -subj "/emailAddress=tu@correo.com/CN=WalletPass Studio/C=MX"
```

**c) Emitir el certificado del pase**
1. En tu Pass Type ID → **Create Certificate** → sube `request.csr` → descarga `pass.cer`.
2. Conviértelo a PEM:
```bash
openssl x509 -inform DER -in pass.cer -out signerCert.pem
```

**d) Certificado intermedio de Apple (WWDR G4)**
```bash
curl -O https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer
openssl x509 -inform DER -in AppleWWDRCAG4.cer -out wwdr.pem
```

> **¿Usaste Llavero (Keychain) en Mac?** Exporta el certificado como `.p12` y extrae:
> ```bash
> openssl pkcs12 -in Certificados.p12 -clcerts -nokeys -out signerCert.pem -legacy
> openssl pkcs12 -in Certificados.p12 -nocerts -out signerKey.pem -legacy   # pide passphrase → APPLE_SIGNER_KEY_PASSPHRASE
> ```

**e) Configurar `.env`** con las rutas `APPLE_WWDR_CERT`, `APPLE_SIGNER_CERT`, `APPLE_SIGNER_KEY` y reinicia. Debes ver `Apple Wallet: ACTIVO`.

**f) HTTPS para actualizaciones.** El mismo certificado sirve para APNs. En local usa un túnel:
```bash
ngrok http 3001       # copia la URL https a PUBLIC_URL y reinicia
```
Si algo falla, el iPhone reporta errores a `POST /wallet/v1/log` y verás `[apple-device]` en la consola.

> El certificado del pase **caduca cada año**. Renuévalo antes o los pases dejarán de actualizarse.

### 2. Google Wallet API (antes "Google Pay API for Passes")

1. Abre la [Google Pay & Wallet Console](https://pay.google.com/business/console) → **Google Wallet API**. Copia tu **Issuer ID** → `GOOGLE_ISSUER_ID`.
2. En [Google Cloud Console](https://console.cloud.google.com): crea (o elige) un proyecto y **habilita "Google Wallet API"**.
3. *IAM y administración → Cuentas de servicio* → crea una cuenta → *Claves* → **Agregar clave → JSON**. Guárdala como `server/certs/google-service-account.json`.
4. De vuelta en la Wallet Console → **Usuarios** → invita el correo de la cuenta de servicio (`...@...iam.gserviceaccount.com`) con acceso de **Desarrollador**.
5. Reinicia el servidor: debes ver `Google Wallet: ACTIVO`.

**Modo demo de Google:** al principio solo las cuentas de prueba que agregues en la consola pueden guardar pases. Cuando esté listo, solicita **acceso de publicación** desde la consola (Google revisa la integración).

El logo se entrega a Google como URL pública (`/assets/...`), así que en producción `PUBLIC_URL` debe ser HTTPS y accesible desde internet.

### 3. Antes de lanzar a producción

- [ ] Cambia `db.js` por PostgreSQL o MongoDB (la interfaz está aislada en ese archivo) o, mínimo, usa un disco persistente para `server/data`.
- [ ] Reemplaza la clave de administrador por cuentas de usuario reales (Clerk, Auth0, Supabase Auth…) si un negocio tendrá varios empleados.
- [ ] Guarda los certificados como secretos del hosting, nunca en git.
- [ ] Respaldos de `server/data` (contiene los seriales y tokens de los pases).
- [ ] Revisa los límites de `express-rate-limit` en `server.js` según tu tráfico.
