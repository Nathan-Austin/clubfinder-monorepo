import { describe, expect, it } from 'vitest';
import {
	bool,
	confirmationCode,
	email,
	fields,
	integer,
	MAX_PASSWORD_LENGTH,
	oneOf,
	password,
	readJsonObject,
	stringArray,
	text,
	uuid
} from './validate';

const post = (body: string) =>
	new Request('http://localhost/', {
		method: 'POST',
		body,
		headers: { 'Content-Type': 'application/json' }
	});

describe('readJsonObject', () => {
	it('returns a JSON object', async () => {
		expect(await readJsonObject(post('{"a":1}'))).toEqual({ a: 1 });
	});
	it('is null for anything that is not a JSON object, and never throws', async () => {
		for (const body of ['', 'not json', '[1,2]', '"text"', 'null', '42']) {
			expect(await readJsonObject(post(body)), body).toBeNull();
		}
	});
});

describe('email', () => {
	it('trims and accepts an address', () => {
		expect(email('  fan@clubfindr.test ')).toEqual({ ok: true, value: 'fan@clubfindr.test' });
	});
	it('refuses what is not a string, blank, too long or not an address', () => {
		for (const value of [undefined, null, 42, ['a@b.c'], {}, '', '   ', 'no-at-sign', 'a b@c.d']) {
			expect(email(value).ok, String(value)).toBe(false);
		}
		expect(email(`${'a'.repeat(250)}@b.cd`).ok).toBe(false);
	});
	it('names the field in its message', () => {
		expect(email(42, 'contactEmail')).toEqual({ ok: false, message: 'contactEmail is required' });
	});
	it('needs a dot in the domain only when strict', () => {
		expect(email('admin@localhost').ok).toBe(true);
		expect(email('admin@localhost', 'email', { strict: true }).ok).toBe(false);
		expect(email('admin@clubfindr.com', 'email', { strict: true }).ok).toBe(true);
	});
});

describe('text', () => {
	it('trims and bounds the length', () => {
		expect(text(' Velour ', 'name', { max: 10 })).toEqual({ ok: true, value: 'Velour' });
		expect(text('x'.repeat(11), 'name', { max: 10 }).ok).toBe(false);
	});
	it('is required unless optional, and optional means ""', () => {
		for (const value of [undefined, null, '', '  ']) {
			expect(text(value, 'name', { max: 10 }).ok).toBe(false);
			expect(text(value, 'name', { max: 10, optional: true })).toEqual({ ok: true, value: '' });
		}
	});
	it('refuses non-strings even when optional', () => {
		expect(text(42, 'name', { max: 10, optional: true }).ok).toBe(false);
		expect(text({}, 'name', { max: 10 }).ok).toBe(false);
	});
});

describe('password', () => {
	it('keeps the value as typed, spaces included', () => {
		expect(password(' Secret#1 ')).toEqual({ ok: true, value: ' Secret#1 ' });
	});
	it('refuses non-strings, empty and oversize values', () => {
		for (const value of [undefined, 12345678, '', 'x'.repeat(MAX_PASSWORD_LENGTH + 1)]) {
			expect(password(value).ok).toBe(false);
		}
		expect(password('x'.repeat(MAX_PASSWORD_LENGTH)).ok).toBe(true);
	});
});

describe('confirmationCode', () => {
	it('accepts venue (hex) and user (decimal) codes, normalised', () => {
		expect(confirmationCode(' a1b2c3 ')).toEqual({ ok: true, value: 'A1B2C3' });
		expect(confirmationCode('123456')).toEqual({ ok: true, value: '123456' });
	});
	it('refuses anything else', () => {
		for (const value of [123456, '12345', '1234567', 'G12345', '', null]) {
			expect(confirmationCode(value).ok, String(value)).toBe(false);
		}
	});
});

describe('uuid, bool, integer, oneOf, stringArray', () => {
	it('uuid', () => {
		expect(uuid('00000000-0000-4000-8000-0000000000b1', 'barId').ok).toBe(true);
		expect(uuid('b1', 'barId')).toEqual({ ok: false, message: 'barId must be a uuid' });
	});
	it('bool, with a fallback for a missing value only', () => {
		expect(bool(true, 'x')).toEqual({ ok: true, value: true });
		expect(bool(undefined, 'x', false)).toEqual({ ok: true, value: false });
		expect(bool('true', 'x', false).ok).toBe(false);
	});
	it('integer', () => {
		expect(integer(3, 'n', { min: 1, max: 5 }).ok).toBe(true);
		for (const value of [0, 6, 2.5, '3', NaN]) {
			expect(integer(value, 'n', { min: 1, max: 5 }).ok).toBe(false);
		}
	});
	it('oneOf', () => {
		const purposes = ['email_verification', 'account_deletion'] as const;
		expect(oneOf('account_deletion', 'purpose', purposes).ok).toBe(true);
		expect(oneOf(undefined, 'purpose', purposes, 'email_verification')).toEqual({
			ok: true,
			value: 'email_verification'
		});
		expect(oneOf('drop', 'purpose', purposes).ok).toBe(false);
	});
	it('stringArray caps items and their length', () => {
		const opts = { maxItems: 2, maxLength: 5 };
		expect(stringArray([' club ', 'bar'], 'barTypes', opts)).toEqual({
			ok: true,
			value: ['club', 'bar']
		});
		expect(stringArray(undefined, 'barTypes', { ...opts, fallback: [] })).toEqual({
			ok: true,
			value: []
		});
		for (const value of ['club', ['a', 'b', 'c'], ['toolong'], [''], [1]]) {
			expect(stringArray(value, 'barTypes', opts).ok, JSON.stringify(value)).toBe(false);
		}
	});
});

describe('fields', () => {
	it('collects the cleaned values', () => {
		expect(fields({ email: email(' a@b.c '), password: password('pw') })).toEqual({
			ok: true,
			value: { email: 'a@b.c', password: 'pw' }
		});
	});
	it('reports the first failure', () => {
		expect(fields({ email: email(1), password: password(2) })).toEqual({
			ok: false,
			message: 'email is required'
		});
	});
});
