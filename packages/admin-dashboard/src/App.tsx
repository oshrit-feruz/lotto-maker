import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { Loading } from './components/ui';
import LoginPage from './pages/LoginPage';
import DrawsPage from './pages/DrawsPage';
import DrawDetailPage from './pages/DrawDetailPage';

const NAV: Array<[string, string]> = [
  ['/draws', 'הגרלות'],
  ['/prize-claims', 'זכיות לאיסוף'],
  ['/withdrawals', 'משיכות'],
  ['/card-credits', 'זיכויי כרטיס'],
  ['/users', 'משתמשים'],
  ['/audit', 'יומן ביקורת'],
];

function Shell() {
  const { status, logout } = useAuth();
  if (status === 'loading') return <Loading />;
  if (status === 'out') return <Navigate to="/login" replace />;
  return (
    <div className="layout" dir="rtl">
      <nav>
        {NAV.map(([to, label]) => (
          <NavLink key={to} to={to}>
            {label}
          </NavLink>
        ))}
        <button className="secondary" onClick={() => void logout()} style={{ marginTop: 'auto' }}>
          יציאה
        </button>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

export default function App() {
  const { status } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={status === 'in' ? <Navigate to="/draws" replace /> : <LoginPage />} />
      <Route element={<Shell />}>
        <Route path="/" element={<Navigate to="/draws" replace />} />
        <Route path="/draws" element={<DrawsPage />} />
        <Route path="/draws/:id" element={<DrawDetailPage />} />
        {/* remaining screens are added section by section */}
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
