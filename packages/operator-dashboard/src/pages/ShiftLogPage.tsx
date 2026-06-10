import { useEffect, useState } from 'react';
import { fetchShiftLog } from '../api/client.js';

export function ShiftLogPage() {
  const [log, setLog] = useState<{ date: string; done: number; failed: number } | null>(null);

  useEffect(() => {
    fetchShiftLog().then(setLog).catch(console.error);
  }, []);

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 16, fontFamily: 'system-ui, sans-serif', direction: 'rtl' }}>
      <h1>לוג משמרת</h1>
      {log ? (
        <div style={{ background: '#f9fafb', borderRadius: 8, padding: 20 }}>
          <p>תאריך: {log.date}</p>
          <p style={{ fontSize: '2rem', fontWeight: 700, color: '#057a55' }}>✓ הושלמו: {log.done}</p>
          <p style={{ fontSize: '1.5rem', color: '#e02424' }}>✗ נכשלו: {log.failed}</p>
        </div>
      ) : (
        <p>טוען...</p>
      )}
    </div>
  );
}
