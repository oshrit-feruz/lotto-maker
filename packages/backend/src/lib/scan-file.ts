/** Largest ticket scan accepted, in bytes. */
export const MAX_SCAN_BYTES = 10 * 1024 * 1024;

export interface ScanFileType {
  ext: 'jpg' | 'png' | 'heic';
  contentType: 'image/jpeg' | 'image/png' | 'image/heic';
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// ISO base media "ftyp" brands used by HEIC/HEIF images
const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);

/**
 * Identifies a scan by its leading bytes (JPEG, PNG or HEIC). The client's
 * mimetype and filename are not trusted. Returns null for anything else.
 */
export function detectScanType(buf: Buffer): ScanFileType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: 'jpg', contentType: 'image/jpeg' };
  }
  if (buf.length >= PNG_SIGNATURE.length && PNG_SIGNATURE.every((b, i) => buf[i] === b)) {
    return { ext: 'png', contentType: 'image/png' };
  }
  if (buf.length >= 12 && buf.toString('latin1', 4, 8) === 'ftyp' && HEIC_BRANDS.has(buf.toString('latin1', 8, 12))) {
    return { ext: 'heic', contentType: 'image/heic' };
  }
  return null;
}
