/**
 * Cliente HTTP del frontend + almacenamiento local de credenciales del negocio.
 */

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body, token } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'No hay conexión con el servidor');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || `Error ${res.status}`, data.details);
  return data;
}

export const api = {
  createBusiness: (body) => request('/api/business/create', { method: 'POST', body }),
  getCard: (id, token) => request(`/api/business/${id}`, { token }),
  updateCard: (id, token, body) => request(`/api/business/${id}`, { method: 'PATCH', body, token }),
  stats: (id, token) => request(`/api/business/${id}/stats`, { token }),
  publicCard: (id) => request(`/api/public/cards/${id}`),

  customer: (id, token, serial) => request(`/api/cards/${id}/customers/${encodeURIComponent(serial)}`, { token }),
  addPoints: (id, token, serial, delta) =>
    request(`/api/cards/${id}/customers/${encodeURIComponent(serial)}/points`, { method: 'POST', body: { delta }, token }),
  redeem: (id, token, serial) =>
    request(`/api/cards/${id}/customers/${encodeURIComponent(serial)}/redeem`, { method: 'POST', token }),

  sendNotification: (cardId, token, title, message) =>
    request('/api/notifications/send', { method: 'POST', body: { cardId, title, message }, token }),

  googleSaveUrl: (id, name) => request(`/pass/google/${id}?name=${encodeURIComponent(name || '')}`),
  appleUrl: (id, name) => `/pass/apple/${id}?name=${encodeURIComponent(name || '')}`,
};

// ───────────── Sesiones guardadas (localStorage) ─────────────
const KEY = 'wps.businesses';

export const sessions = {
  all() {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || [];
    } catch {
      return [];
    }
  },
  save(entry) {
    const list = sessions.all().filter((s) => s.id !== entry.id);
    list.unshift(entry);
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch {
      /* modo privado: la sesión vive solo en memoria */
    }
  },
  get(id) {
    return sessions.all().find((s) => s.id === id) || null;
  },
  remove(id) {
    try {
      localStorage.setItem(KEY, JSON.stringify(sessions.all().filter((s) => s.id !== id)));
    } catch { /* ignore */ }
  },
};

/** Lee un archivo de imagen y lo reduce a ≤ 800px antes de subirlo. */
export function fileToDataUrl(file, max = 800) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('El archivo debe ser una imagen'));
    if (file.type === 'image/svg+xml') {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(new Error('No se pudo leer el archivo'));
      return r.readAsDataURL(file);
    }
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('Imagen no válida'));
    img.src = URL.createObjectURL(file);
  });
}

/** Igual que el servidor: texto blanco o negro según el fondo. */
export function contrastText(hex) {
  const n = parseInt((hex || '#000000').slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  return L > 0.4 ? '#111111' : '#ffffff';
}
