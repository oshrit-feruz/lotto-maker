import { useRef, useState } from 'react';
import { uploadScan } from '../../api/client.js';

interface Props {
  slotId: string;
  onClose: () => void;
  onSuccess: () => void;
  /** The ticket has Extra: the operator types the 6 digits the terminal printed. */
  extra?: boolean;
}

export function ScanUpload({ slotId, onClose, onSuccess, extra = false }: Readonly<Props>) {
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

  function handleUpload() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    uploadScan(slotId, file, extra ? extraDigits : undefined)
      .then(() => onSuccess())
      .catch(() => setError('שגיאה בהעלאה. נסה שוב.'))
      .finally(() => setUploading(false));
  }

  return (
    <div className="backdrop">
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={`scan-title-${slotId}`}>
        <h2 id={`scan-title-${slotId}`}>סרוק טופס</h2>

        <label className="dropzone">
          <span>צלמו את הטופס המודפס או בחרו תמונה</span>
          <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} />
        </label>

        {extra && (
          <div className="field">
            <label htmlFor={`extra-${slotId}`}>ספרות Extra מהטופס</label>
            <input
              id={`extra-${slotId}`}
              className="input input-digits"
              value={extraDigits}
              onChange={(e) => setExtraDigits(e.target.value.replaceAll(/[^1-7]/g, '').slice(0, 6))}
              placeholder="ספרות Extra (6 ספרות, 1-7)"
              inputMode="numeric"
            />
          </div>
        )}

        {preview && <img src={preview} alt="preview" className="preview" />}

        {error && (
          <p className="alert alert-error" role="alert">
            {error}
          </p>
        )}

        <div className="dialog-actions">
          <button type="button" onClick={handleUpload} disabled={!preview || uploading || !extraValid} className="btn">
            {uploading ? 'מעלה...' : 'אשר ושייך'}
          </button>
          <button type="button" onClick={onClose} className="btn btn-ghost">
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
