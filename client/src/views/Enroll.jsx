/**
 * Página pública que ve el CLIENTE FINAL al escanear el QR del mostrador:
 *   /c/:cardId  →  "Agregar a Apple Wallet" / "Agregar a Google Wallet"
 */
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Info, Loader2 } from 'lucide-react';
import PassPreview from '../components/PassPreview.jsx';
import { api, contrastText } from '../api.js';

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document);
const isAndroid = /Android/i.test(ua);

export default function Enroll() {
  const { cardId } = useParams();
  const [card, setCard] = useState(null);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(null);
  const [appleDemo, setAppleDemo] = useState(false);
  const previewRef = useRef(null);

  useEffect(() => {
    api.publicCard(cardId).then(({ card }) => setCard(card)).catch((e) => setError(e.message));
  }, [cardId]);

  function addApple() {
    // Con certificados de prueba el iPhone rechaza el .pkpass: mostramos la vista previa
    if (card.platforms.appleDemo) {
      setAppleDemo(true);
      setTimeout(() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      return;
    }
    setBusy('apple');
    // Safari abre el .pkpass directamente en Wallet
    window.location.href = api.appleUrl(cardId, name);
    setTimeout(() => setBusy(null), 4000);
  }

  async function addGoogle() {
    setBusy('google');
    setError(null);
    try {
      const { saveUrl } = await api.googleSaveUrl(cardId, name);
      window.location.href = saveUrl;
    } catch (e) {
      setError(e.message);
      setBusy(null);
    }
  }

  if (!card && !error) {
    return <div className="grid min-h-dvh place-items-center"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>;
  }
  if (!card) {
    return <div className="grid min-h-dvh place-items-center p-6 text-center text-zinc-500">{error}</div>;
  }

  const fg = contrastText(card.color);
  const appleBtn = (
    <button key="a" onClick={addApple} disabled={!card.platforms.apple || busy}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-black text-[15px] font-medium text-white transition active:scale-[.98] disabled:opacity-40">
      {busy === 'apple' ? <Loader2 className="h-4 w-4 animate-spin" /> : <AppleLogo />} Agregar a Apple Wallet
    </button>
  );
  const googleBtn = (
    <button key="g" onClick={addGoogle} disabled={!card.platforms.google || busy}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white text-[15px] font-medium text-zinc-900 transition active:scale-[.98] disabled:opacity-40">
      {busy === 'google' ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleLogo />} Agregar a Google Wallet
    </button>
  );

  return (
    <div className="min-h-dvh" style={{ background: `linear-gradient(180deg, ${card.color} 0 220px, #fafafa 220px)` }}>
      <div className="mx-auto max-w-md px-5 pt-10 pb-12">
        <div className="text-center" style={{ color: fg }}>
          <img src={card.logoUrl} alt="" className="mx-auto h-16 w-16 rounded-full bg-white object-contain p-1 shadow-lg" />
          <h1 className="mt-3 text-2xl font-semibold">{card.name}</h1>
          <p className="mt-1 text-sm opacity-85">
            Junta {card.rewardGoal} {card.pointsLabel.toLowerCase()} y obtén: {card.rewardDescription}
          </p>
        </div>

        <div className="panel mt-8 space-y-4 p-5 shadow-sm">
          <label className="block">
            <span className="label">Tu nombre (opcional)</span>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ana" maxLength={40} />
          </label>
          {/* El botón de la plataforma del usuario va primero */}
          <div className="space-y-2.5">{isAndroid ? [googleBtn, appleBtn] : [appleBtn, googleBtn]}</div>
          {(!card.platforms.apple || !card.platforms.google) && (
            <p className="text-center text-xs text-zinc-500">
              {!card.platforms.apple && !card.platforms.google
                ? 'Este negocio aún está configurando sus tarjetas digitales.'
                : `${card.platforms.apple ? 'Google' : 'Apple'} Wallet estará disponible pronto.`}
            </p>
          )}
          {error && <p className="text-center text-sm text-red-600">{error}</p>}
          <p className="text-center text-xs text-zinc-400">Sin descargar apps · Gratis · Puedes borrarla cuando quieras</p>
        </div>

        <div ref={previewRef} className="scroll-mt-6">
          {appleDemo && (
            <div className="mt-8 flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                <span className="font-semibold">Modo demo.</span> Apple Wallet todavía no está activado para este
                negocio, así que la tarjeta no se puede agregar al iPhone. Así es como se verá:
              </p>
            </div>
          )}
        </div>
        <div className="mt-10 scale-90">
          <PassPreview card={{ ...card, logoSrc: card.headerLogoUrl }} platform={appleDemo || isIOS || !isAndroid ? 'apple' : 'google'}
            points={0} customerName={name || 'Tú'} />
        </div>
        <p className="mt-6 text-center text-xs text-zinc-400">¿Dudas? Llama al {card.phone}</p>
      </div>
    </div>
  );
}

const AppleLogo = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor"><path d="M16.37 12.4c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.65.8-3.33.8-.69 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.19-1.54 2.67-.39 6.62 1.1 8.79.73 1.06 1.6 2.25 2.74 2.21 1.1-.04 1.51-.71 2.84-.71 1.32 0 1.7.71 2.86.69 1.18-.02 1.93-1.08 2.65-2.15.84-1.23 1.18-2.42 1.2-2.48-.03-.01-2.3-.88-2.32-3.5zM14.2 5.94c.6-.74 1.02-1.76.9-2.78-.87.04-1.94.58-2.57 1.31-.56.65-1.06 1.7-.93 2.7.98.08 1.98-.5 2.6-1.23z" /></svg>
);
const GoogleLogo = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5"><path fill="#4285F4" d="M21.6 12.23c0-.7-.06-1.37-.18-2.02H12v3.83h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.23c1.9-1.74 2.99-4.3 2.99-7.33z" /><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.61-2.44l-3.23-2.5c-.9.6-2.04.95-3.38.95-2.6 0-4.8-1.75-5.59-4.11H3.08v2.58A10 10 0 0 0 12 22z" /><path fill="#FBBC05" d="M6.41 13.9a6 6 0 0 1 0-3.8V7.52H3.08a10 10 0 0 0 0 8.96l3.33-2.58z" /><path fill="#EA4335" d="M12 5.98c1.47 0 2.79.5 3.83 1.5l2.86-2.86A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.92 5.52l3.33 2.58C7.2 7.73 9.4 5.98 12 5.98z" /></svg>
);
