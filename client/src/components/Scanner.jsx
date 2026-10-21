/**
 * Lector de QR con la cámara (html5-qrcode). Lee el serial del pase del cliente.
 * Requiere HTTPS o localhost para que el navegador permita la cámara.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { CameraOff } from 'lucide-react';

export default function Scanner({ onResult }) {
  const elementId = `qr-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const [error, setError] = useState(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    const scanner = new Html5Qrcode(elementId, { verbose: false });
    let done = false;

    const starting = scanner
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1 },
        (text) => {
          if (done) return; // evitar lecturas duplicadas
          done = true;
          onResultRef.current(text.trim());
        },
        () => { /* frames sin QR: se ignoran */ },
      )
      .catch((err) => {
        setError(
          String(err).includes('Permission')
            ? 'Permite el acceso a la cámara para escanear.'
            : 'No se pudo abrir la cámara (requiere HTTPS o localhost).',
        );
      });

    // Limpieza: detener la cámara al cerrar el modal (también en el doble montaje de StrictMode)
    return () => {
      done = true;
      starting
        .then(() => (scanner.isScanning ? scanner.stop() : null))
        .then(() => scanner.clear())
        .catch(() => {});
    };
  }, [elementId]);

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-zinc-900">
      <div id={elementId} className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover" />
      {error && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-zinc-300">
          <div>
            <CameraOff className="mx-auto mb-2 h-6 w-6" />
            {error}
          </div>
        </div>
      )}
    </div>
  );
}
