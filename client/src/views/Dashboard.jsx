/**
 * Vista 2 — Panel de control del negocio
 *  · Métricas de tarjetas instaladas
 *  · Escanear / acreditar puntos y canjear recompensas
 *  · Notificación masiva a la pantalla de bloqueo
 *  · QR de inscripción para el mostrador
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  Bell, Check, Copy, Download, ExternalLink, Gift, KeyRound, Loader2, Minus, Pencil,
  Plus, ScanLine, Send, Smartphone, Users, X,
} from 'lucide-react';
import Scanner from '../components/Scanner.jsx';
import { api, sessions } from '../api.js';

export default function Dashboard() {
  const { cardId } = useParams();
  if (!cardId) return <BusinessPicker />;
  return <BusinessDashboard key={cardId} cardId={cardId} />;
}

// ───────────── Selector / acceso ─────────────
function BusinessPicker() {
  const list = sessions.all();
  const navigate = useNavigate();
  const [form, setForm] = useState({ id: '', token: '' });
  const [state, setState] = useState({ loading: false, error: null });

  if (list.length === 1) return <Navigate to={`/dashboard/${list[0].id}`} replace />;

  async function login(e) {
    e.preventDefault();
    setState({ loading: true, error: null });
    try {
      const { card } = await api.getCard(form.id.trim(), form.token.trim());
      sessions.save({ id: card.id, name: card.name, token: form.token.trim() });
      navigate(`/dashboard/${card.id}`);
    } catch (err) {
      setState({ loading: false, error: err.status === 401 || err.status === 404 ? 'ID o clave incorrectos' : err.message });
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Tus negocios</h1>
      {list.length > 0 && (
        <div className="panel divide-y divide-zinc-100">
          {list.map((s) => (
            <Link key={s.id} to={`/dashboard/${s.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-zinc-50">
              <span className="font-medium">{s.name}</span>
              <span className="text-xs text-zinc-400">Abrir →</span>
            </Link>
          ))}
        </div>
      )}
      <form onSubmit={login} className="panel space-y-3 p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4" /> Entrar con tu clave</h2>
        <input className="field font-mono" placeholder="ID de tarjeta" value={form.id}
          onChange={(e) => setForm({ ...form, id: e.target.value })} />
        <input className="field font-mono" placeholder="Clave de administrador" type="password" value={form.token}
          onChange={(e) => setForm({ ...form, token: e.target.value })} />
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <button className="btn-primary w-full" disabled={state.loading || !form.id || !form.token}>
          {state.loading && <Loader2 className="h-4 w-4 animate-spin" />} Entrar
        </button>
      </form>
      <p className="text-center text-sm text-zinc-500">
        ¿Nuevo? <Link to="/" className="font-medium text-zinc-900 underline">Crea tu tarjeta</Link>
      </p>
    </div>
  );
}

// ───────────── Panel ─────────────
function BusinessDashboard({ cardId }) {
  const session = sessions.get(cardId);
  const token = session?.token;
  const [card, setCard] = useState(null);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [scanOpen, setScanOpen] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [{ card }, s] = await Promise.all([api.getCard(cardId, token), api.stats(cardId, token)]);
      setCard(card);
      setStats(s);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [cardId, token]);

  useEffect(() => {
    if (!token) return;
    refresh();
    const t = setInterval(refresh, 15_000); // mantiene las métricas al día
    return () => clearInterval(t);
  }, [refresh, token]);

  if (!token) return <Navigate to="/dashboard" replace />;
  if (!card) {
    return (
      <div className="grid place-items-center py-24 text-zinc-500">
        {error ? <p>{error}</p> : <Loader2 className="h-6 w-6 animate-spin" />}
      </div>
    );
  }

  const t = stats?.totals || {};

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <img src={card.logoUrl} alt="" className="h-12 w-12 rounded-full border border-zinc-200 bg-white object-contain" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{card.name}</h1>
            <p className="text-sm text-zinc-500">{card.rewardGoal} {card.pointsLabel.toLowerCase()} = {card.rewardDescription}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to={`/edit/${card.id}`} className="btn-ghost"><Pencil className="h-4 w-4" /> Editar diseño</Link>
          <button onClick={() => setScanOpen(true)} className="btn-primary"><ScanLine className="h-4 w-4" /> Escanear cliente</button>
        </div>
      </div>

      {error && <div className="rounded-xl bg-amber-50 px-4 py-2 text-sm text-amber-800">{error}</div>}
      <PlatformBanner platforms={card.platforms} />

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={Users} label="Tarjetas emitidas" value={t.issued} />
        <Stat icon={Smartphone} label="Instaladas en iPhone" value={t.appleInstalled}
          hint={`${t.apple ?? 0} descargadas`} />
        <Stat icon={Smartphone} label="Google Wallet" value={t.google} hint="enlaces emitidos" />
        <Stat icon={Gift} label="Recompensas canjeadas" value={t.rewardsRedeemed}
          hint={t.readyToRedeem ? `${t.readyToRedeem} listas para canjear` : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <NotificationComposer card={card} token={token} audience={t.issued || 0}
            history={stats?.notifications || []} onSent={refresh} />
          <CustomersTable customers={stats?.customers || []} card={card} />
        </div>
        <EnrollQr card={card} />
      </div>

      {scanOpen && (
        <ScanModal card={card} token={token} onClose={() => { setScanOpen(false); refresh(); }} />
      )}
    </div>
  );
}

function PlatformBanner({ platforms }) {
  if (platforms.apple && platforms.google) return null;
  const missing = [!platforms.apple && 'Apple Wallet', !platforms.google && 'Google Wallet'].filter(Boolean).join(' y ');
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <strong>Modo simulado:</strong> {missing} aún no tiene credenciales en el servidor. Puedes probar el panel,
      los puntos y las notificaciones (se registran como simuladas). Consulta el README para configurarlo.
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint }) {
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-zinc-500"><Icon className="h-3.5 w-3.5" /> {label}</div>
      <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">{value ?? '—'}</div>
      {hint && <div className="mt-0.5 text-xs text-zinc-400">{hint}</div>}
    </div>
  );
}

// ───────────── Notificación masiva ─────────────
function NotificationComposer({ card, token, audience, history, onSent }) {
  const [title, setTitle] = useState(card.name);
  const [message, setMessage] = useState('');
  const [state, setState] = useState({ loading: false, error: null, ok: null });

  async function send(e) {
    e.preventDefault();
    if (!window.confirm(`¿Enviar esta notificación a ${audience} tarjeta(s)?`)) return;
    setState({ loading: true, error: null, ok: null });
    try {
      const { notification } = await api.sendNotification(card.id, token, title, message.trim());
      setState({
        loading: false, error: null,
        ok: `${notification.simulated ? 'Simulada' : 'Enviada'} a ${notification.audience} tarjeta(s).`,
      });
      setMessage('');
      onSent();
    } catch (err) {
      setState({ loading: false, error: err.message, ok: null });
    }
  }

  return (
    <section className="panel p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><Bell className="h-4 w-4" /> Notificación a pantalla de bloqueo</h2>
      <p className="mt-1 text-sm text-zinc-500">Llega a todos los clientes con tu tarjeta instalada.</p>

      <form onSubmit={send} className="mt-4 grid gap-5 md:grid-cols-[1fr_260px]">
        <div className="space-y-3">
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="Título (Google Wallet)" />
          <div className="relative">
            <textarea className="field min-h-28 resize-none" value={message} maxLength={180}
              onChange={(e) => setMessage(e.target.value)} placeholder="☕ ¡Hoy 2x1 en lattes de 4 a 6 pm!" />
            <span className="absolute right-3 bottom-2 text-xs text-zinc-400">{message.length}/180</span>
          </div>
          <div className="flex items-center gap-3">
            <button className="btn-primary" disabled={state.loading || message.trim().length < 3}>
              {state.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar a {audience}
            </button>
            {state.ok && <span className="flex items-center gap-1 text-sm text-emerald-700"><Check className="h-4 w-4" />{state.ok}</span>}
            {state.error && <span className="text-sm text-red-600">{state.error}</span>}
          </div>
        </div>

        {/* Vista previa de pantalla de bloqueo */}
        <div className="rounded-2xl bg-gradient-to-b from-zinc-700 to-zinc-900 p-3 pt-6 text-center">
          <div className="text-4xl font-light text-white/90">9:41</div>
          <div className="mt-4 flex gap-2.5 rounded-2xl bg-white/80 p-2.5 text-left backdrop-blur">
            <img src={card.logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-lg bg-white object-contain" />
            <div className="min-w-0 text-xs leading-snug">
              <div className="flex justify-between"><span className="font-semibold">{card.name}</span><span className="text-zinc-500">ahora</span></div>
              <p className="line-clamp-3 text-zinc-800">{message || 'Tu mensaje aparecerá aquí'}</p>
            </div>
          </div>
        </div>
      </form>

      {history.length > 0 && (
        <div className="mt-5 border-t border-zinc-100 pt-4">
          <h3 className="label">Historial</h3>
          <ul className="space-y-2">
            {history.slice(0, 5).map((n) => (
              <li key={n.id} className="flex items-start justify-between gap-3 text-sm">
                <span className="text-zinc-700">{n.text}</span>
                <span className="shrink-0 text-xs text-zinc-400">
                  {n.simulated && <span className="mr-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-amber-800">simulada</span>}
                  {new Date(n.sentAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ───────────── Clientes ─────────────
function CustomersTable({ customers, card }) {
  return (
    <section className="panel overflow-hidden">
      <h2 className="px-5 pt-5 text-sm font-semibold">Clientes recientes</h2>
      {customers.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-zinc-500">
          Aún no hay clientes. Pon el QR de inscripción en tu mostrador para que empiecen a sumar.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-5 py-2 font-medium">Cliente</th>
                <th className="px-3 py-2 font-medium">Cartera</th>
                <th className="px-3 py-2 font-medium">{card.pointsLabel}</th>
                <th className="px-5 py-2 text-right font-medium">Última visita</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {customers.map((c) => (
                <tr key={c.serial}>
                  <td className="px-5 py-2.5">
                    <div className="font-medium">{c.name}</div>
                    <div className="font-mono text-xs text-zinc-400">{c.serial.slice(0, 8).toUpperCase()}</div>
                  </td>
                  <td className="px-3 py-2.5 text-zinc-600">{c.platform === 'apple' ? 'Apple' : 'Google'}</td>
                  <td className="px-3 py-2.5 tabular-nums">
                    {c.points}/{card.rewardGoal}
                    {c.points >= card.rewardGoal && <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 text-xs text-emerald-800">lista</span>}
                  </td>
                  <td className="px-5 py-2.5 text-right text-zinc-500">
                    {c.lastVisitAt ? new Date(c.lastVisitAt).toLocaleDateString('es-MX') : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ───────────── QR de inscripción ─────────────
function EnrollQr({ card }) {
  const qrRef = useRef(null);
  const [copied, setCopied] = useState(false);

  function download() {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `qr-${card.name}.svg` });
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <aside className="panel h-fit p-5 lg:sticky lg:top-24">
      <h2 className="text-sm font-semibold">QR para tu mostrador</h2>
      <p className="mt-1 text-sm text-zinc-500">Tus clientes lo escanean y guardan la tarjeta en segundos.</p>
      <div ref={qrRef} className="mt-4 flex justify-center rounded-2xl p-5" style={{ background: card.color }}>
        <div className="rounded-xl bg-white p-3">
          <QRCodeSVG value={card.enrollUrl} size={180} level="M" marginSize={1} />
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-zinc-100 p-1.5 pl-3">
        <span className="flex-1 truncate font-mono text-xs text-zinc-600">{card.enrollUrl}</span>
        <button className="rounded-lg p-1.5 hover:bg-white" aria-label="Copiar enlace"
          onClick={async () => { await navigator.clipboard?.writeText(card.enrollUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
          {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={download} className="btn-ghost"><Download className="h-4 w-4" /> SVG</button>
        <a href={`/c/${card.id}`} target="_blank" rel="noreferrer" className="btn-ghost"><ExternalLink className="h-4 w-4" /> Abrir</a>
      </div>
    </aside>
  );
}

// ───────────── Escáner + acreditar puntos ─────────────
function ScanModal({ card, token, onClose }) {
  const [serial, setSerial] = useState('');
  const [manual, setManual] = useState('');
  const [customer, setCustomer] = useState(null);
  const [state, setState] = useState({ loading: false, error: null, ok: null });

  async function lookup(value) {
    setState({ loading: true, error: null, ok: null });
    try {
      const { customer } = await api.customer(card.id, token, value);
      setCustomer(customer);
      setSerial(value);
      setState({ loading: false, error: null, ok: null });
    } catch (err) {
      setState({ loading: false, error: err.message, ok: null });
    }
  }

  async function addPoints(delta) {
    setState({ loading: true, error: null, ok: null });
    try {
      const res = await api.addPoints(card.id, token, serial, delta);
      setCustomer(res.customer);
      setState({ loading: false, error: null, ok: res.rewardReady ? '¡Recompensa desbloqueada! 🎉' : `${delta > 0 ? '+' : ''}${delta} acreditado` });
    } catch (err) {
      setState({ loading: false, error: err.message, ok: null });
    }
  }

  async function redeem() {
    if (!window.confirm(`¿Canjear "${card.rewardDescription}"?`)) return;
    setState({ loading: true, error: null, ok: null });
    try {
      const res = await api.redeem(card.id, token, serial);
      setCustomer(res.customer);
      setState({ loading: false, error: null, ok: 'Recompensa canjeada ✓' });
    } catch (err) {
      setState({ loading: false, error: err.message, ok: null });
    }
  }

  const reset = () => { setCustomer(null); setSerial(''); setManual(''); setState({ loading: false, error: null, ok: null }); };
  const ready = customer && customer.points >= card.rewardGoal;

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-zinc-900/40 backdrop-blur-sm sm:place-items-center sm:p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold">{customer ? 'Cliente' : 'Escanear tarjeta'}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 hover:bg-zinc-100" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>

        {!customer ? (
          <>
            <Scanner onResult={lookup} />
            <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (manual.trim()) lookup(manual.trim()); }}>
              <input className="field font-mono text-xs" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="o pega el código del pase" />
              <button className="btn-ghost" disabled={!manual.trim() || state.loading}>Buscar</button>
            </form>
          </>
        ) : (
          <div>
            <div className="rounded-2xl p-4" style={{ background: `${card.color}12` }}>
              <div className="text-lg font-semibold">{customer.name}</div>
              <div className="font-mono text-xs text-zinc-500">{customer.serial.slice(0, 8).toUpperCase()} · {customer.platform === 'apple' ? 'Apple' : 'Google'} Wallet</div>
              <div className="mt-4 flex items-end justify-between">
                <span className="text-4xl font-semibold tabular-nums">{customer.points}<span className="text-lg text-zinc-400">/{card.rewardGoal}</span></span>
                <span className="text-sm text-zinc-500">{card.pointsLabel.toLowerCase()}</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-zinc-200">
                <div className="h-2 rounded-full transition-all" style={{ width: `${Math.min(100, (customer.points / card.rewardGoal) * 100)}%`, background: card.color }} />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-4 gap-2">
              <button onClick={() => addPoints(-1)} disabled={state.loading || customer.points === 0} className="btn-ghost"><Minus className="h-4 w-4" /></button>
              {[1, 2, 5].map((d) => (
                <button key={d} onClick={() => addPoints(d)} disabled={state.loading} className="btn-primary">
                  <Plus className="h-3.5 w-3.5" />{d}
                </button>
              ))}
            </div>
            {ready && (
              <button onClick={redeem} disabled={state.loading} className="btn mt-2 w-full bg-emerald-600 text-white hover:bg-emerald-700">
                <Gift className="h-4 w-4" /> Canjear: {card.rewardDescription}
              </button>
            )}
            <button onClick={reset} className="btn-ghost mt-2 w-full"><ScanLine className="h-4 w-4" /> Escanear otro</button>
          </div>
        )}

        <div className="mt-3 min-h-5 text-center text-sm">
          {state.loading && <Loader2 className="mx-auto h-4 w-4 animate-spin text-zinc-400" />}
          {state.error && <span className="text-red-600">{state.error}</span>}
          {state.ok && <span className="text-emerald-700">{state.ok}</span>}
        </div>
      </div>
    </div>
  );
}
