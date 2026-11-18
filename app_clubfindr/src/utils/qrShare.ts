/**
 * Turning the QR code on screen into a PNG for the share sheet (KNOWN_ISSUES 83).
 *
 * `react-native-svg`'s `toDataURL` does not hand back a data URL: Android passes the PNG as bare
 * base64 (`SvgView.toDataURL`, `Base64.NO_WRAP`), and iOS calls back with nothing when the capture
 * fails. The screen split the value on "," and wrote `undefined` to the file, which threw inside
 * a `setTimeout` its try/catch did not cover, so the spinner modal never closed.
 */

/** The part of `react-native-svg`'s Svg ref (what `react-native-qrcode-svg`'s `getRef` gives) used here. */
export type QrSvgRef = {
  toDataURL: (callback: (base64: string) => void) => void;
};

// Standard base64 only: what both platforms produce, and what expo-file-system's Base64 writer takes
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * The PNG's base64 from what `toDataURL` called back with: bare base64 (Android) or, should a
 * platform ever add one, a `data:image/png;base64,` prefix. Throws when there is no image.
 */
export function qrPngBase64(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('The QR code could not be captured');
  }
  const comma = value.indexOf(',');
  const base64 = (value.startsWith('data:') && comma !== -1 ? value.slice(comma + 1) : value).trim();
  if (!base64 || !BASE64.test(base64)) {
    throw new Error('The QR code could not be captured');
  }
  return base64;
}

/**
 * The QR code's PNG as base64. Rejects if the code is not on screen, if `toDataURL` throws, or if
 * it calls back without an image. There is deliberately no timeout (owner's decision 2026-11-17):
 * the share modal has a Cancel button instead, and a callback that arrives after Cancel is ignored
 * by the screen.
 */
export function captureQrPng(ref: QrSvgRef | null | undefined): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!ref) {
      reject(new Error('The QR code is not on screen yet'));
      return;
    }
    try {
      ref.toDataURL((value) => {
        try {
          resolve(qrPngBase64(value));
        } catch (error) {
          reject(error);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

/** The file the share sheet gets: in the app's cache, so no storage permission is involved.
 * The id is a number from the server (bar_qr_codes.id is a serial): typing it as a string made
 * every share throw `qrId.replace is not a function` (DEVICE_CHECKLIST 2026-11-18, section 8). */
export function qrShareFilePath(cacheDirectory: string | null, qrId: string | number): string {
  if (!cacheDirectory) {
    throw new Error('No cache directory to write the QR code to');
  }
  const safeId = String(qrId).replace(/[^A-Za-z0-9_-]/g, '_');
  const dir = cacheDirectory.endsWith('/') ? cacheDirectory : `${cacheDirectory}/`;
  return `${dir}qrcode-${safeId}.png`;
}
