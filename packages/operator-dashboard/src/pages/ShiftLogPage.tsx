import { useEffect, useState } from 'react';
import { fetchShiftLog } from '../api/client.js';

export function ShiftLogPage() {
  const [log, setLog] = useState<{ date: string; done: number; failed: number } | null>(null);

  useEffect(() => {
    fetchShiftLog().then(setLog).catch(console.error);
  }, []);

  return (
    <main className="page">
      <div className="page-head">
        <h1>לוג משמרת</h1>
        {log && (
          <span className="badge">
            תאריך: <span className="ltr">{log.date}</span>
          </span>
        )}
      </div>
      {log ? (
        <div className="stats">
          <div className="stat">
            <p className="stat-label">✓ הושלמו</p>
            <p className="stat-value">{log.done}</p>
          </div>
          <div className="stat bad">
            <p className="stat-label">✗ נכשלו</p>
            <p className="stat-value">{log.failed}</p>
          </div>
        </div>
      ) : (
        <p className="muted">טוען...</p>
      )}
    </main>
  );
}
