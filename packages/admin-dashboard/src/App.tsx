import { NavLink, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import LoginPage from './pages/LoginPage';
import DrawsPage from './pages/DrawsPage';
import DrawDetailPage from './pages/DrawDetailPage';
import PrizeClaimsPage from './pages/PrizeClaimsPage';
import WithdrawalsPage from './pages/WithdrawalsPage';
import CardCreditsPage from './pages/CardCreditsPage';
import UsersPage from './pages/UsersPage';
import UserDetailPage from './pages/UserDetailPage';
import AuditPage from './pages/AuditPage';

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
        <Route path="/prize-claims" element={<PrizeClaimsPage />} />
        <Route path="/withdrawals" element={<WithdrawalsPage />} />
        <Route path="/card-credits" element={<CardCreditsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/users/:id" element={<UserDetailPage />} />
        <Route path="/audit" element={<AuditPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
