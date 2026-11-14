// Small, hand-written input checks for the API endpoints (ROADMAP section 4,
// docs/section4-inventory.md). No validation library on purpose: the owner chose plain guards
// like isUuid over adding zod or valibot (2026-11-14).
//
// Each check takes an unknown value and returns either the cleaned value or a message naming
// the field, so an endpoint can answer 400 before any query runs, in whatever response shape
// its clients already read. `fields` runs several and stops at the first failure.
//
// What it guards against, from the inventory: a number or object where a string is expected
// threw (`email.trim is not a function`) and answered 500 with a stack in the logs; strings and
// arrays of any length reached the database (a phone longer than varchar(20) was a 500 too); and
// a body that is not JSON at all threw in `request.json()`, often outside the handler's try.

export type Check<T> = { ok: true; value: T } | { ok: false; message: string };

const ok = <T>(value: T): Check<T> => ({ ok: true, value });
const fail = <T>(message: string): Check<T> => ({ ok: false, message });

/**
 * The request body as a plain object, or null if it is not JSON or not an object (an array,
 * a string, `null`). Never throws, unlike `request.json()`.
 */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
	try {
		const body: unknown = await request.json();
		return body !== null && typeof body === 'object' && !Array.isArray(body)
			? (body as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

/** RFC 5321's limit for a whole address. */
export const MAX_EMAIL_LENGTH = 254;
// Lookups (logins, resends, confirmations) accept anything shaped like an address, so no
// account stored under an unusual address is locked out. New accounts get the stricter pattern
// the registration pages already apply ($lib/passwordUtils.validateEmail).
const EMAIL_LOOSE = /^[^\s@]+@[^\s@]+$/;
const EMAIL_STRICT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** An e-mail address, trimmed. `strict` for addresses a new account will be stored under. */
export function email(value: unknown, field = 'email', { strict = false } = {}): Check<string> {
	if (typeof value !== 'string' || !value.trim()) return fail(`${field} is required`);
	const trimmed = value.trim();
	if (trimmed.length > MAX_EMAIL_LENGTH) {
		return fail(`${field} must be at most ${MAX_EMAIL_LENGTH} characters`);
	}
	if (!(strict ? EMAIL_STRICT : EMAIL_LOOSE).test(trimmed)) {
		return fail(`${field} must be an e-mail address`);
	}
	return ok(trimmed);
}

/**
 * A non-empty string of at most `max` characters, trimmed. With `optional`, a missing, null or
 * blank value is accepted as ''.
 */
export function text(
	value: unknown,
	field: string,
	{ max, optional = false }: { max: number; optional?: boolean }
): Check<string> {
	if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
		return optional ? ok('') : fail(`${field} is required`);
	}
	if (typeof value !== 'string') return fail(`${field} must be a string`);
	const trimmed = value.trim();
	if (trimmed.length > max) return fail(`${field} must be at most ${max} characters`);
	return ok(trimmed);
}

/**
 * A password as typed, not trimmed. Only its type and size are checked: a login must accept
 * whatever an account was created with, and strength is $lib/passwordUtils.validatePassword's
 * job at registration. The cap keeps a megabyte "password" from being hashed.
 */
export const MAX_PASSWORD_LENGTH = 1024;
export function password(value: unknown, field = 'password'): Check<string> {
	if (typeof value !== 'string' || value.length === 0) return fail(`${field} is required`);
	if (value.length > MAX_PASSWORD_LENGTH) {
		return fail(`${field} must be at most ${MAX_PASSWORD_LENGTH} characters`);
	}
	return ok(value);
}

/**
 * An e-mailed confirmation code: six hex digits (venue codes) or six decimal digits (user
 * codes, which are hex digits too), trimmed and upper-cased.
 */
const CODE_PATTERN = /^[0-9A-F]{6}$/;
export function confirmationCode(value: unknown, field = 'confirmationCode'): Check<string> {
	if (typeof value !== 'string' || !value.trim()) return fail(`${field} is required`);
	const normalized = value.trim().toUpperCase();
	if (!CODE_PATTERN.test(normalized)) return fail(`${field} must be six letters or digits`);
	return ok(normalized);
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function uuid(value: unknown, field: string): Check<string> {
	return typeof value === 'string' && UUID_PATTERN.test(value)
		? ok(value)
		: fail(`${field} must be a uuid`);
}

/** A boolean; `fallback` when the value is missing. */
export function bool(value: unknown, field: string, fallback?: boolean): Check<boolean> {
	if (value === undefined && fallback !== undefined) return ok(fallback);
	return typeof value === 'boolean' ? ok(value) : fail(`${field} must be true or false`);
}

/** An integer between min and max inclusive. */
export function integer(
	value: unknown,
	field: string,
	{ min, max }: { min: number; max: number }
): Check<number> {
	return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
		? ok(value)
		: fail(`${field} must be a whole number from ${min} to ${max}`);
}

/** One of a fixed set of strings; `fallback` when the value is missing. */
export function oneOf<T extends string>(
	value: unknown,
	field: string,
	allowed: readonly T[],
	fallback?: T
): Check<T> {
	if (value === undefined && fallback !== undefined) return ok(fallback);
	return typeof value === 'string' && (allowed as readonly string[]).includes(value)
		? ok(value as T)
		: fail(`${field} must be one of ${allowed.join(', ')}`);
}

/**
 * An array of at most `maxItems` non-empty strings of at most `maxLength` characters each,
 * trimmed; `fallback` when the value is missing.
 */
export function stringArray(
	value: unknown,
	field: string,
	{ maxItems, maxLength, fallback }: { maxItems: number; maxLength: number; fallback?: string[] }
): Check<string[]> {
	if (value === undefined && fallback !== undefined) return ok(fallback);
	if (!Array.isArray(value)) return fail(`${field} must be a list`);
	if (value.length > maxItems) return fail(`${field} must have at most ${maxItems} entries`);
	const items: string[] = [];
	for (const item of value) {
		if (typeof item !== 'string' || !item.trim() || item.trim().length > maxLength) {
			return fail(`${field} entries must be text of 1 to ${maxLength} characters`);
		}
		items.push(item.trim());
	}
	return ok(items);
}

/**
 * Runs a set of checks; the cleaned values by field name, or the first failure's message.
 *
 *   const input = fields({ email: email(body.email), password: password(body.password) });
 *   if (!input.ok) return json({ message: input.message }, { status: 400 });
 *   input.value.email // string
 */
export function fields<T extends Record<string, Check<unknown>>>(
	checks: T
): Check<{ [K in keyof T]: T[K] extends Check<infer V> ? V : never }> {
	const values: Record<string, unknown> = {};
	for (const [name, check] of Object.entries(checks)) {
		if (!check.ok) return fail(check.message);
		values[name] = check.value;
	}
	return ok(values as { [K in keyof T]: T[K] extends Check<infer V> ? V : never });
}
