/**
 * Vista previa fiel del pase en un iPhone (Apple Wallet) o Android (Google Wallet).
 * Refleja la misma estructura que genera el servidor:
 *   Apple:  logo + nombre · puntos (header) · tira de sellos · progreso/recompensa · cliente · QR
 *   Google: logo circular · programa · puntos · meta · QR
 */
import { QRCodeSVG } from 'qrcode.react';
import { contrastText } from '../api.js';

function Logo({ src, name, color, className }) {
  if (src) return <img src={src} alt="" className={`object-contain ${className}`} />;
  return (
    <div className={`grid place-items-center rounded-full font-bold ${className}`}
      style={{ background: contrastText(color), color }}>
      {(name || '?').trim()[0]?.toUpperCase() || '?'}
    </div>
  );
}

/** Tira de sellos (igual que services/images.js → stripBuffers) */
function Stamps({ goal, points, color, fg }) {
  if (goal > 20) {
    const pct = Math.min(100, (points / goal) * 100);
    return (
      <div className="h-3 w-full rounded-full" style={{ background: `${fg}40` }}>
        <div className="h-3 rounded-full transition-all" style={{ width: `${Math.max(5, pct)}%`, background: fg }} />
      </div>
    );
  }
  const rows = goal > 10 ? 2 : 1;
  const perRow = Math.ceil(goal / rows);
  return (
    <div className="grid w-full justify-center gap-1.5"
      style={{ gridTemplateColumns: `repeat(${perRow}, minmax(0, 26px))` }}>
      {Array.from({ length: goal }, (_, i) => {
        const filled = i < points;
        return (
          <div key={i} className="grid aspect-square place-items-center rounded-full border-2 transition-all"
            style={{ borderColor: filled ? fg : `${fg}70`, background: filled ? fg : 'transparent' }}>
            {filled && (
              <svg viewBox="0 0 24 24" className="h-3/5 w-3/5" fill="none" stroke={color} strokeWidth="3.5"
                strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ApplePass({ card, points, customerName }) {
  const fg = contrastText(card.color);
  const label = (card.pointsLabel || 'Sellos').toUpperCase();
  const ready = points >= card.rewardGoal;
  return (
    <div className="overflow-hidden rounded-[14px] shadow-xl shadow-black/20 transition-colors"
      style={{ background: card.color, color: fg }}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        <div className="flex min-w-0 items-center gap-2">
          <Logo src={card.logoSrc} name={card.name} color={card.color} className="h-7 w-7 shrink-0 text-sm" />
          <span className="truncate text-[15px] font-semibold">{card.name || 'Tu negocio'}</span>
        </div>
        <div className="text-right leading-tight">
          <div className="text-[9px] font-semibold tracking-wide opacity-80">{label}</div>
          <div className="text-lg font-semibold tabular-nums">{points}</div>
        </div>
      </div>
      {/* Strip de sellos */}
      <div className="flex h-[92px] items-center px-5" style={{ background: 'rgba(0,0,0,.12)' }}>
        <Stamps goal={card.rewardGoal} points={points} color={card.color} fg={fg} />
      </div>
      {/* Campos */}
      <div className="grid grid-cols-2 gap-2 px-3 pt-2.5">
        <Field label="PROGRESO" value={ready ? '¡Recompensa lista! 🎉' : `${points} de ${card.rewardGoal}`} />
        <Field label="RECOMPENSA" value={card.rewardDescription || 'Tu recompensa'} align="right" />
      </div>
      <div className="px-3 pt-2">
        <Field label="CLIENTE" value={customerName || 'Cliente'} />
      </div>
      {/* QR */}
      <div className="flex justify-center px-3 pt-4 pb-4">
        <div className="rounded-lg bg-white p-2 text-center">
          <QRCodeSVG value="walletpass-preview" size={84} />
          <div className="mt-1 font-mono text-[8px] text-zinc-500">A1B2C3D4</div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, align }) {
  return (
    <div className={`min-w-0 leading-tight ${align === 'right' ? 'text-right' : ''}`}>
      <div className="text-[9px] font-semibold tracking-wide opacity-75">{label}</div>
      <div className="truncate text-[13px] font-medium">{value}</div>
    </div>
  );
}

function GooglePass({ card, points, customerName }) {
  const fg = contrastText(card.color);
  return (
    <div className="overflow-hidden rounded-[20px] shadow-xl shadow-black/20 transition-colors"
      style={{ background: card.color, color: fg }}>
      <div className="flex items-center gap-2.5 px-4 pt-4">
        <div className="h-9 w-9 overflow-hidden rounded-full bg-white">
          <Logo src={card.logoSrc} name={card.name} color={card.color} className="h-full w-full p-1 text-sm" />
        </div>
        <span className="truncate text-sm font-medium">{card.name || 'Tu negocio'}</span>
      </div>
      <div className="px-4 pt-3 text-xl font-normal leading-snug">{card.name || 'Tu negocio'}</div>
      <div className="grid grid-cols-2 gap-3 px-4 pt-4">
        <div>
          <div className="text-[10px] opacity-80">{card.pointsLabel || 'Sellos'}</div>
          <div className="text-lg tabular-nums">{points}</div>
        </div>
        <div>
          <div className="text-[10px] opacity-80">Meta</div>
          <div className="text-lg tabular-nums">{points >= card.rewardGoal ? '¡Lista!' : `${points}/${card.rewardGoal}`}</div>
        </div>
      </div>
      <div className="flex justify-center px-4 pt-5 pb-3">
        <div className="rounded-xl bg-white p-2.5 text-center">
          <QRCodeSVG value="walletpass-preview" size={96} />
          <div className="mt-1 font-mono text-[9px] text-zinc-500">A1B2C3D4</div>
        </div>
      </div>
      <div className="px-4 pb-4 text-center text-[11px] opacity-80">{customerName || 'Cliente'}</div>
    </div>
  );
}

/** Marco de teléfono minimalista */
export default function PassPreview({ card, platform = 'apple', points = 3, customerName }) {
  const isApple = platform === 'apple';
  return (
    <div className={`relative mx-auto w-[300px] border-[10px] border-zinc-900 bg-zinc-100 shadow-2xl
      ${isApple ? 'rounded-[48px]' : 'rounded-[36px]'}`}>
      <div className={`h-[600px] overflow-hidden ${isApple ? 'rounded-[38px]' : 'rounded-[26px]'}`}>
        {/* Barra de estado */}
        <div className="relative flex h-11 items-center justify-between px-6 text-[11px] font-semibold text-zinc-900">
          <span>9:41</span>
          {isApple
            ? <span className="absolute left-1/2 top-2 h-6 w-24 -translate-x-1/2 rounded-full bg-zinc-900" />
            : <span className="absolute left-1/2 top-3 h-3 w-3 -translate-x-1/2 rounded-full bg-zinc-900" />}
          <span>●●● 100%</span>
        </div>
        <div className="px-3 pt-1 pb-2 text-lg font-bold text-zinc-900">{isApple ? 'Wallet' : 'Google Wallet'}</div>
        <div className="px-3">
          {isApple
            ? <ApplePass card={card} points={points} customerName={customerName} />
            : <GooglePass card={card} points={points} customerName={customerName} />}
        </div>
      </div>
    </div>
  );
}
