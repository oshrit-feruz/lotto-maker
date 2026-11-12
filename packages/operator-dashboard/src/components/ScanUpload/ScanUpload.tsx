import { useRef, useState } from 'react';
import { uploadScan } from '../../api/client.js';

interface Props {
  slotId: string;
  onClose: () => void;
  onSuccess: () => void;
  /** The ticket has Extra: the operator types the 6 digits the terminal printed. */
  extra?: boolean;
}

export function ScanUpload({ slotId, onClose, onSuccess, extra = false }: Props) {
  const [extraDigits, setExtraDigits] = useState('');
  const extraValid = !extra || /^[1-7]{6}$/.test(extraDigits);
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file));
  }

  async function handleUpload() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      await uploadScan(slotId, file, extra ? extraDigits : undefined);
      onSuccess();
    } catch {
      setError('שגיאה בהעלאה. נסה שוב.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: 340, maxWidth: '90vw' }}>
        <h2 style={{ marginTop: 0 }}>סרוק טופס</h2>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          style={{ marginBottom: 12, width: '100%' }}
        />

        {extra && (
          <input
            value={extraDigits}
            onChange={(e) => setExtraDigits(e.target.value.replace(/[^1-7]/g, '').slice(0, 6))}
            placeholder="ספרות Extra (6 ספרות, 1-7)"
            inputMode="numeric"
            style={{ marginBottom: 12, width: '100%', padding: 8, direction: 'ltr', boxSizing: 'border-box' }}
          />
        )}

        {preview && (
          <img src={preview} alt="preview" style={{ width: '100%', borderRadius: 8, marginBottom: 12 }} />
        )}

        {error && <p style={{ color: '#e02424' }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleUpload} disabled={!preview || uploading || !extraValid} style={{ flex: 1, padding: 12, background: '#057a55', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 700, fontSize: '1rem', cursor: 'pointer' }}>
            {uploading ? 'מעלה...' : 'אשר ושייך'}
          </button>
          <button onClick={onClose} style={{ padding: '12px 16px', background: '#e5e7eb', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
