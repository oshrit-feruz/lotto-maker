import { useState } from 'react';
import { LoginPage } from './pages/LoginPage.js';
import { QueuePage } from './pages/QueuePage.js';
import { ShiftLogPage } from './pages/ShiftLogPage.js';
import { clearToken } from './api/client.js';

type Page = 'queue' | 'shift-log';

export function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(localStorage.getItem('operator_token')));
  const [page, setPage] = useState<Page>('queue');

  if (!isLoggedIn) {
    return <LoginPage onLogin={() => setIsLoggedIn(true)} />;
  }

  return (
    <div>
      <nav className="topbar">
        <div className="topbar-inner">
          <span className="brand">
            <span className="brand-mark" aria-hidden="true" />
            לוטו מייקר
          </span>
          <button type="button" className="nav-btn" aria-current={page === 'queue' ? 'page' : undefined} onClick={() => setPage('queue')}>
            תור
          </button>
          <button
            type="button"
            className="nav-btn"
            aria-current={page === 'shift-log' ? 'page' : undefined}
            onClick={() => setPage('shift-log')}
          >
            לוג משמרת
          </button>
          <button
            type="button"
            className="nav-btn logout"
            onClick={() => {
              clearToken();
              setIsLoggedIn(false);
            }}
          >
            יציאה
          </button>
        </div>
      </nav>

      {page === 'queue' && <QueuePage />}
      {page === 'shift-log' && <ShiftLogPage />}
    </div>
  );
}
