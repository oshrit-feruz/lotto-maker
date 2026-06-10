import { useState } from 'react';
import { LoginPage } from './pages/LoginPage.js';
import { QueuePage } from './pages/QueuePage.js';
import { ShiftLogPage } from './pages/ShiftLogPage.js';
import { clearToken } from './api/client.js';

type Page = 'queue' | 'shift-log';

export function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(!!localStorage.getItem('operator_token'));
  const [page, setPage] = useState<Page>('queue');

  if (!isLoggedIn) {
    return <LoginPage onLogin={() => setIsLoggedIn(true)} />;
  }

  return (
    <div>
      <nav style={{ background: '#1a56db', padding: '10px 16px', display: 'flex', gap: 16, alignItems: 'center', direction: 'rtl' }}>
        <span style={{ color: '#fff', fontWeight: 700, fontSize: '1.1rem' }}>לוטו מייקר</span>
        <button onClick={() => setPage('queue')} style={navBtn(page === 'queue')}>תור</button>
        <button onClick={() => setPage('shift-log')} style={navBtn(page === 'shift-log')}>לוג משמרת</button>
        <button onClick={() => { clearToken(); setIsLoggedIn(false); }} style={{ ...navBtn(false), marginRight: 'auto' }}>יציאה</button>
      </nav>

      {page === 'queue' && <QueuePage />}
      {page === 'shift-log' && <ShiftLogPage />}
    </div>
  );
}

function navBtn(active: boolean): React.CSSProperties {
  return {
    background: active ? 'rgba(255,255,255,0.2)' : 'transparent',
    color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4,
    cursor: 'pointer', fontWeight: active ? 700 : 400,
  };
}
