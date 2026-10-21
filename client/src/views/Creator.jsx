/**
 * Vista 1 — Onboarding / Creador de tarjeta (también sirve para editar: /edit/:cardId)
 * El formulario y la vista previa comparten el mismo estado → actualización en tiempo real.
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Apple, Check, Copy, ImagePlus, Loader2, Smartphone, X } from 'lucide-react';
import PassPreview from '../components/PassPreview.jsx';
import { api, fileToDataUrl, sessions } from '../api.js';

const COLOR_PRESETS = ['#18181b', '#7c2d12', '#be123c', '#c2410c', '#15803d', '#0f766e', '#1d4ed8', '#6d28d9', '#fde047'];
const LABEL_PRESETS = ['Sellos', 'Puntos', 'Visitas', 'Cafés'];

const INITIAL = {
  name: '',
  color: '#7c2d12',
  rewardDescription: '',
  phone: '',
  pointsLabel: 'Sellos',
  rewardGoal: 10,
  logo: null, // data URL nuevo (solo si el usuario sube uno)
};

export default function Creator() {
  const { cardId } = useParams();
  const editing = Boolean(cardId);
  const session = editing ? sessions.get(cardId) : null;
  const navigate = useNavigate();

  const [form, setForm] = useState(INITIAL);
  const [logoSrc, setLogoSrc] = useState(null);
  const [platform, setPlatform] = useState('apple');
  const [demoPoints, setDemoPoints] = useState(3);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ loading: editing, error: null });
  const [created, setCreated] = useState(null); // { card, adminToken }

  // Modo edición: cargar la tarjeta existente
  useEffect(() => {
    if (!editing) return;
    if (!session) {
      setStatus({ loading: false, error: 'No tienes acceso a esta tarjeta desde este navegador.' });
      return;
    }
    api.getCard(cardId, session.token)
      .then(({ card }) => {
        setForm({ ...INITIAL, ...pick(card), logo: null });
        setLogoSrc(card.headerLogoUrl);
        setStatus({ loading: false, error: null });
      })
      .catch((err) => setStatus({ loading: false, error: err.message }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  const set = (key) => (e) => {
    const value = e?.target ? e.target.value : e;
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((er) => ({ ...er, [key]: undefined }));
  };

  async function onLogo(file) {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setForm((f) => ({ ...f, logo: dataUrl }));
      setLogoSrc(dataUrl);
      setErrors((er) => ({ ...er, logo: undefined }));
    } catch (err) {
      setErrors((er) => ({ ...er, logo: err.message }));
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    const local = validate(form);
    setErrors(local);
    if (Object.keys(local).length) return;

    setStatus({ loading: true, error: null });
    const body = { ...form, rewardGoal: Number(form.rewardGoal) };
    if (!body.logo) delete body.logo;
    try {
      if (editing) {
        await api.updateCard(cardId, session.token, body);
        sessions.save({ ...session, name: form.name });
        navigate(`/dashboard/${cardId}`);
      } else {
        const res = await api.createBusiness(body);
        sessions.save({ id: res.card.id, name: res.card.name, token: res.adminToken });
        setCreated(res);
      }
      setStatus({ loading: false, error: null });
    } catch (err) {
      setErrors(err.details || {});
      setStatus({ loading: false, error: err.message });
    }
  }

  const validColor = /^#[0-9a-f]{6}$/i.test(form.color) ? form.color : '#71717a';
  const previewCard = { ...form, color: validColor, logoSrc, rewardGoal: Number(form.rewardGoal) || 1 };

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_380px]">
      {/* ───────── Formulario ───────── */}
      <form onSubmit={onSubmit} className="space-y-8" noValidate>
        <div>
          <p className="text-sm font-medium text-zinc-500">{editing ? 'Editar tarjeta' : 'Paso 1 de 1'}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {editing ? 'Ajusta tu tarjeta' : 'Diseña tu tarjeta de lealtad'}
          </h1>
          <p className="mt-2 max-w-lg text-zinc-500">
            Tus clientes la guardan en Apple Wallet o Google Wallet desde un enlace o QR. Sin descargar apps.
          </p>
        </div>

        <Section title="Tu negocio">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Nombre del negocio" error={errors.name}>
              <input className="field" value={form.name} onChange={set('name')} placeholder="Café Luna" maxLength={60} />
            </Input>
            <Input label="Teléfono" error={errors.phone}>
              <input className="field" value={form.phone} onChange={set('phone')} placeholder="+52 55 1234 5678" inputMode="tel" />
            </Input>
          </div>
          <LogoDrop src={logoSrc} onFile={onLogo} error={errors.logo}
            onClear={() => { setLogoSrc(null); setForm((f) => ({ ...f, logo: null })); }} />
        </Section>

        <Section title="Color corporativo">
          <div className="flex flex-wrap items-center gap-2">
            {COLOR_PRESETS.map((c) => (
              <button type="button" key={c} onClick={() => set('color')(c)} aria-label={`Color ${c}`}
                className={`h-9 w-9 rounded-full ring-offset-2 transition ${form.color === c ? 'ring-2 ring-zinc-900' : 'hover:scale-110'}`}
                style={{ background: c }} />
            ))}
            <label className="relative ml-1 flex items-center gap-2 rounded-xl border border-zinc-200 bg-white py-1.5 pr-3 pl-1.5">
              <input type="color" value={validColor} onChange={set('color')}
                className="h-7 w-7 cursor-pointer rounded-lg border-0 bg-transparent p-0" />
              <input value={form.color} onChange={set('color')} maxLength={7}
                className="w-20 font-mono text-sm uppercase outline-none" />
            </label>
          </div>
          {errors.color && <p className="mt-2 text-xs text-red-600">{errors.color}</p>}
        </Section>

        <Section title="Programa de recompensas">
          <Input label="Recompensa" error={errors.rewardDescription}>
            <input className="field" value={form.rewardDescription} onChange={set('rewardDescription')}
              placeholder="Un café americano gratis" maxLength={120} />
          </Input>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="¿Qué acumulan?" error={errors.pointsLabel}>
              <div className="flex flex-wrap gap-1.5">
                {LABEL_PRESETS.map((l) => (
                  <button type="button" key={l} onClick={() => set('pointsLabel')(l)}
                    className={`rounded-lg px-3 py-1.5 text-sm transition ${form.pointsLabel === l
                      ? 'bg-zinc-900 text-white' : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'}`}>
                    {l}
                  </button>
                ))}
              </div>
            </Input>
            <Input label={`Meta: ${form.rewardGoal} ${form.pointsLabel.toLowerCase()}`} error={errors.rewardGoal}>
              <input type="range" min={3} max={20} value={form.rewardGoal}
                onChange={(e) => { set('rewardGoal')(Number(e.target.value)); setDemoPoints((p) => Math.min(p, Number(e.target.value))); }}
                className="w-full accent-zinc-900" />
            </Input>
          </div>
        </Section>

        {status.error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{status.error}</div>
        )}

        <div className="flex items-center gap-3">
          <button type="submit" className="btn-primary px-6" disabled={status.loading || (editing && !session)}>
            {status.loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {editing ? 'Guardar y actualizar pases' : 'Crear tarjeta'}
          </button>
          {editing && <span className="text-xs text-zinc-500">Los pases ya instalados se actualizan solos.</span>}
        </div>
      </form>

      {/* ───────── Vista previa ───────── */}
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="mb-4 flex items-center justify-between">
          <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-1">
            {[['apple', 'iPhone', Apple], ['google', 'Android', Smartphone]].map(([key, label, Icon]) => (
              <button key={key} type="button" onClick={() => setPlatform(key)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${platform === key ? 'bg-zinc-900 text-white' : 'text-zinc-600'}`}>
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
          <span className="text-xs text-zinc-400">Vista previa</span>
        </div>
        <PassPreview card={previewCard} platform={platform} points={demoPoints} customerName="Ana García" />
        <label className="mx-auto mt-5 block w-[300px]">
          <span className="label">Simular {form.pointsLabel.toLowerCase()}: {demoPoints}</span>
          <input type="range" min={0} max={form.rewardGoal} value={demoPoints}
            onChange={(e) => setDemoPoints(Number(e.target.value))} className="w-full accent-zinc-900" />
        </label>
      </aside>

      {created && <CreatedModal data={created} onClose={() => navigate(`/dashboard/${created.card.id}`)} />}
    </div>
  );
}

// ───────────── Subcomponentes ─────────────
function Section({ title, children }) {
  return (
    <section className="panel space-y-4 p-5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Input({ label, error, children }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

function LogoDrop({ src, onFile, onClear, error }) {
  const ref = useRef(null);
  const [over, setOver] = useState(false);
  return (
    <div>
      <span className="label">Logo (PNG, JPG o SVG · máx 2 MB)</span>
      <div
        onClick={() => ref.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files?.[0]); }}
        className={`flex cursor-pointer items-center gap-4 rounded-xl border border-dashed p-4 transition
          ${over ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-300 hover:border-zinc-400'}`}>
        <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-zinc-100">
          {src ? <img src={src} alt="Logo" className="h-full w-full object-contain" /> : <ImagePlus className="h-5 w-5 text-zinc-400" />}
        </div>
        <div className="flex-1 text-sm">
          <p className="font-medium">{src ? 'Cambiar logo' : 'Sube tu logo'}</p>
          <p className="text-zinc-500">Arrastra aquí o haz clic. Si no subes uno, usamos tu inicial.</p>
        </div>
        {src && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100" aria-label="Quitar logo">
            <X className="h-4 w-4" />
          </button>
        )}
        <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden
          onChange={(e) => onFile(e.target.files?.[0])} />
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function CreatedModal({ data, onClose }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard?.writeText(data.adminToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-zinc-900/40 p-4 backdrop-blur-sm">
      <div className="panel w-full max-w-md p-6 shadow-2xl">
        <div className="grid h-11 w-11 place-items-center rounded-full bg-emerald-100 text-emerald-700">
          <Check className="h-5 w-5" />
        </div>
        <h2 className="mt-4 text-xl font-semibold">¡{data.card.name} ya tiene tarjeta!</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Guarda esta clave de administrador. Es la única forma de entrar a tu panel desde otro dispositivo
          y no la volveremos a mostrar.
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-zinc-100 p-2 pl-3">
          <code className="flex-1 truncate font-mono text-xs">{data.adminToken}</code>
          <button onClick={copy} className="btn-ghost px-3 py-1.5 text-xs">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? 'Copiada' : 'Copiar'}
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">ID de tarjeta: <span className="font-mono">{data.card.id}</span></p>
        <button onClick={onClose} className="btn-primary mt-6 w-full">Ir a mi panel</button>
      </div>
    </div>
  );
}

// ───────────── Helpers ─────────────
function pick(card) {
  const { name, color, rewardDescription, phone, pointsLabel, rewardGoal } = card;
  return { name, color, rewardDescription, phone, pointsLabel, rewardGoal };
}

function validate(f) {
  const e = {};
  if (!f.name.trim()) e.name = 'Escribe el nombre de tu negocio';
  if (!f.rewardDescription.trim()) e.rewardDescription = '¿Qué gana tu cliente?';
  if (!/^[+\d\s()-]{7,25}$/.test(f.phone.trim())) e.phone = 'Teléfono inválido';
  if (!/^#[0-9a-f]{6}$/i.test(f.color)) e.color = 'Usa un color hexadecimal, ej. #7c2d12';
  return e;
}
