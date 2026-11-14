// Which web origins may call /api/* from a browser (KNOWN_ISSUES 54).
//
// Every /api/* response used to carry `Access-Control-Allow-Origin: *`, from hooks.server.ts,
// from several routes, and from nginx on top. No credentials were ever allowed cross-origin, so
// browsers did not send cookies with such requests, but any site could still read every public
// API answer from its visitors' browsers. Decided 2026-11-14: only the site itself.
//
//   - https://clubfindr.com and https://www.clubfindr.com, always;
//   - the deployment's own ORIGIN (adapter-node's setting; https://www.clubfindr.com in
//     production, http://localhost:<port> for a local build and the e2e suite);
//   - any http://localhost or http://127.0.0.1 port under `vite dev`.
//
// The site's own pages call the API same-origin and need none of this; the native app sends no
// Origin header and is not subject to CORS at all. A request from any other origin is still
// answered, just without the header, so the browser keeps the answer from the calling page.

export const SITE_ORIGINS = ['https://clubfindr.com', 'https://www.clubfindr.com'] as const;

const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

export const CORS_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
export const CORS_HEADERS = 'Content-Type, Authorization';

/** The origin to echo in Access-Control-Allow-Origin, or null to send none. */
export function allowedOrigin(
	origin: string | null,
	{ dev, configuredOrigin }: { dev: boolean; configuredOrigin?: string }
): string | null {
	if (!origin) return null;
	if ((SITE_ORIGINS as readonly string[]).includes(origin)) return origin;
	if (configuredOrigin && origin === configuredOrigin.replace(/\/+$/, '')) return origin;
	if (dev && LOCAL_ORIGIN.test(origin)) return origin;
	return null;
}

/**
 * Sets the CORS headers on `headers` for a request from `origin`: the allowed origin echoed back,
 * or every Access-Control-* header removed (a route may have set its own). Always `Vary: Origin`,
 * since the answer now depends on it and a cache must not hand one origin's answer to another.
 */
export function applyCors(
	headers: Headers,
	origin: string | null,
	options: { dev: boolean; configuredOrigin?: string }
): void {
	headers.append('Vary', 'Origin');
	const allowed = allowedOrigin(origin, options);
	if (!allowed) {
		for (const name of [...headers.keys()]) {
			if (name.toLowerCase().startsWith('access-control-')) headers.delete(name);
		}
		return;
	}
	headers.set('Access-Control-Allow-Origin', allowed);
	headers.set('Access-Control-Allow-Methods', CORS_METHODS);
	headers.set('Access-Control-Allow-Headers', CORS_HEADERS);
}
