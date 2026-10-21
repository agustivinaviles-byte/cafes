import { NavLink, Route, Routes, useLocation } from 'react-router-dom';
import Creator from './views/Creator.jsx';
import Dashboard from './views/Dashboard.jsx';
import Enroll from './views/Enroll.jsx';

function Brand() {
  return (
    <NavLink to="/" className="flex items-center gap-2.5">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-zinc-900">
        <svg viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="white" strokeWidth="2.2">
          <rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 10h18" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-tight">WalletPass Studio</span>
    </NavLink>
  );
}

const linkClass = ({ isActive }) =>
  `rounded-lg px-3 py-1.5 text-sm transition ${isActive ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100'}`;

export default function App() {
  const { pathname } = useLocation();
  // La página de inscripción del cliente final no lleva la navegación del panel
  if (pathname.startsWith('/c/')) {
    return (
      <Routes>
        <Route path="/c/:cardId" element={<Enroll />} />
      </Routes>
    );
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-zinc-200/70 bg-zinc-50/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
          <Brand />
          <nav className="flex gap-1">
            <NavLink to="/" end className={linkClass}>Crear tarjeta</NavLink>
            <NavLink to="/dashboard" className={linkClass}>Panel</NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Routes>
          <Route path="/" element={<Creator />} />
          <Route path="/edit/:cardId" element={<Creator />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/:cardId" element={<Dashboard />} />
          <Route path="*" element={<p className="py-20 text-center text-zinc-500">Página no encontrada</p>} />
        </Routes>
      </main>
    </div>
  );
}
