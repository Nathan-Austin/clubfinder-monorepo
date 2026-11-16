/**
 * Reading the venue lists the matching endpoints answer with
 * (`POST /api/mobile/bars/matching`, `POST /api/mobile/events/matching`).
 *
 * On success both always answer a JSON array (possibly empty); every failure is a non-2xx status,
 * which the HTTP client already throws on. So a successful reply that is not an array is
 * malformed, and must reach the screen as an error with "Try again", not as "nothing found":
 * until 2026-11-16 TilkiScreen read `response.data || []`, which turned a null body into an empty
 * result, and in date-range mode caught every failed request and counted it as no venues.
 */
import type { Venue } from '../services/discoveryService';

export class MalformedVenueResponse extends Error {
  constructor(what: string) {
    super(`The server's ${what} list was not a list`);
    this.name = 'MalformedVenueResponse';
  }
}

/** The venues in a matching reply; throws MalformedVenueResponse for anything but an array */
export function venueList(data: unknown, what: 'bar' | 'club'): Venue[] {
  if (!Array.isArray(data)) throw new MalformedVenueResponse(what);
  return data as Venue[];
}
