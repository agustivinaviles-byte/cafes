import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// En desarrollo, Vite (5173) reenvía las llamadas de API al backend (3001).
const backend = 'http://localhost:3001';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // /assets lo usa el servidor para los logos de las tarjetas
  build: { assetsDir: 'static' },
  server: {
    port: 5173,
    host: true, // accesible desde tu celular en la misma red
    // Túneles HTTPS (cloudflared / ngrok) para probar Wallet desde el celular
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app'],
    proxy: {
      '/api': backend,
      '/pass': backend,
      '/wallet': backend,
      '/assets': backend,
    },
  },
});
