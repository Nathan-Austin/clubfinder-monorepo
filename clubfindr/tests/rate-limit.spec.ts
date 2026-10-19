import { test, expect } from './fixtures';
import { hammer, expectHealthExempt } from './rate-limit';

/**
 * KNOWN_ISSUES #5: the rate limiter (60 requests/minute, hooks.server.ts) keyed on the raw
 * X-Forwarded-For header, falling back to CF-Connecting-IP, exactly as the client sent them.
 * Anyone could open a fresh bucket per request by varying a header.
 *
 * The client address must come from event.getClientAddress(), i.e. from the one header the
 * deployment trusts (ADDRESS_HEADER / XFF_DEPTH, set for the test server in
 * playwright.config.ts: the last X-Forwarded-For entry). Everything else in the request is
 * attacker-controlled and must not influence the bucket. tests/rate-limit-cf.spec.ts repeats
 * this against a server configured like production (ADDRESS_HEADER=cf-connecting-ip).
 *
 * Addresses are from the TEST-NET ranges so they never collide with tests/fixtures.ts.
 */

test.describe('rate limiter client address', () => {
	test('entries a client prepends to X-Forwarded-For do not open new buckets', async ({
		request
	}) => {
		// Same trusted (last) hop every time, a different spoofed entry in front of it
		const statuses = await hammer(request, (i) => ({
			'x-forwarded-for': `203.0.113.${i}, 192.0.2.10`
		}));
		expect(statuses).not.toContain(500);
		expect(statuses[0]).toBe(200);
		expect(statuses, 'one bucket for one trusted address').toContain(429);
		await expectHealthExempt(request, { 'x-forwarded-for': '192.0.2.10' });
	});

	test('without the trusted header, other address headers are ignored and the request is still served', async ({
		request
	}) => {
		// No X-Forwarded-For at all: a direct/local request. Header-only "identities" must not
		// give it a bucket of its own, and it must not be a 500 either.
		const statuses = await hammer(request, (i) => ({
			'cf-connecting-ip': `203.0.113.${i}`,
			'x-real-ip': `198.51.100.${i}`
		}));
		expect(statuses).not.toContain(500);
		expect(statuses[0]).toBe(200);
		expect(statuses, 'all header-less requests share one bucket').toContain(429);
	});

	test('distinct trusted addresses keep their own buckets', async ({ request }) => {
		const statuses = await hammer(request, (i) => ({ 'x-forwarded-for': `192.0.2.${100 + i}` }));
		expect(statuses.every((s) => s === 200)).toBe(true);
	});
});
