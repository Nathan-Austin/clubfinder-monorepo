/**
 * Reading a venue's check-in QR code (KNOWN_ISSUES 84).
 *
 * The server writes two forms of the same code, and the scanner has to accept both:
 * - `clubfindr://checkin?barId=…&qrId=…&type=…&barName=…`, the app's deep link, given to a code
 *   just created (`POST /api/mobile/bars/:barId/qrcodes`);
 * - `https://clubfindr.com/redirect?barId=…&qrId=…&type=…`, given to every code in the venue's
 *   list (`GET` on the same route), so a phone's own camera opens the web page, which hands over
 *   to the app or the store. Kept on purpose (owner's decision 2026-11-17): codes may already be
 *   printed with it.
 * The scanner accepted only the first, so a code shared or shown from the list was refused as
 * "not a valid Tilki QR code".
 *
 * Plain string handling rather than `URL`: React Native's `URL` is a small subset that behaves
 * differently from Node's, so tests run under Jest would not show what the phone does.
 */

export type QrCodeType = 'entrance' | 'table' | 'event' | 'promotion';

export type CheckinCode = {
  barId: string;
  qrId: string;
  qrType?: QrCodeType;
};

export type CheckinCodeResult =
  | { kind: 'checkin'; code: CheckinCode }
  /** Some other QR code: a website, a menu, a Wi-Fi code, another app's */
  | { kind: 'not-tilki' }
  /** Ours by its address, but without a usable venue or code id */
  | { kind: 'incomplete' };

// Lower case, without a trailing slash; the query string follows
const CHECKIN_BASES = [
  'clubfindr://checkin',
  'https://clubfindr.com/redirect',
  'https://www.clubfindr.com/redirect',
];

const QR_CODE_TYPES: readonly QrCodeType[] = ['entrance', 'table', 'event', 'promotion'];

// What POST /api/mobile/checkin accepts: barId a uuid, qrId a positive 32-bit integer
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const QR_ID = /^[1-9][0-9]{0,9}$/;
const MAX_QR_ID = 2147483647;

function decode(part: string): string | null {
  try {
    return decodeURIComponent(part.replace(/\+/g, ' '));
  } catch {
    return null; // a malformed %-escape
  }
}

/** The query string's values, the first one for a repeated name. */
function queryValues(query: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const pair of query.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const name = decode(eq === -1 ? pair : pair.slice(0, eq));
    const value = decode(eq === -1 ? '' : pair.slice(eq + 1));
    if (name === null || value === null || values.has(name)) continue;
    values.set(name, value);
  }
  return values;
}

/** What a scanned QR code says, if it is a Tilki venue's check-in code. */
export function parseCheckinCode(data: unknown): CheckinCodeResult {
  if (typeof data !== 'string') return { kind: 'not-tilki' };

  const text = data.trim();
  const withoutFragment = text.split('#')[0];
  const questionMark = withoutFragment.indexOf('?');
  const base = (questionMark === -1 ? withoutFragment : withoutFragment.slice(0, questionMark))
    .toLowerCase()
    .replace(/\/+$/, '');
  if (!CHECKIN_BASES.includes(base)) return { kind: 'not-tilki' };

  const values = queryValues(questionMark === -1 ? '' : withoutFragment.slice(questionMark + 1));
  const barId = values.get('barId')?.trim() ?? '';
  const qrId = values.get('qrId')?.trim() ?? '';
  if (!UUID.test(barId) || !QR_ID.test(qrId) || Number(qrId) > MAX_QR_ID) {
    return { kind: 'incomplete' };
  }

  const type = values.get('type')?.trim().toLowerCase();
  const qrType = QR_CODE_TYPES.find((known) => known === type);
  return { kind: 'checkin', code: qrType ? { barId, qrId, qrType } : { barId, qrId } };
}
