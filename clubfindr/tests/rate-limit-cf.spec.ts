import { test, expect } from './fixtures';
import { hammer, expectHealthExempt } from './rate-limit';

/**
 * The rate limiter against a server configured like production: ADDRESS_HEADER=cf-connecting-ip
 * (Cloudflare sets that header for every visitor and nginx passes it through; only Cloudflare
 * can reach nginx). Runs in the `cf-connecting-ip` Playwright project against the second
 * server in playwright.config.ts. Address ranges are distinct from tests/rate-limit.spec.ts.
 */
test.describe('rate limiter with ADDRESS_HEADER=cf-connecting-ip', () => {
	test('a spoofed X-Forwarded-For does not escape the bucket', async ({ request }) => {
		// What reaches node for one visitor who varies the XFF they send: Cloudflare appends
		// the visitor, nginx appends the Cloudflare edge; CF-Connecting-IP is the visitor
		const statuses = await hammer(request, (i) => ({
			'x-forwarded-for': `203.0.113.${i}, 198.51.100.7, 172.70.1.5`,
			'x-real-ip': '172.70.1.5',
			'cf-connecting-ip': '198.51.100.7'
		}));
		expect(statuses).not.toContain(500);
		expect(statuses[0]).toBe(200);
		expect(statuses, 'one bucket for the one CF-Connecting-IP').toContain(429);
		await expectHealthExempt(request, { 'cf-connecting-ip': '198.51.100.7' });
	});

	test('different CF-Connecting-IP values get their own buckets', async ({ request }) => {
		const statuses = await hammer(request, (i) => ({
			'x-forwarded-for': `198.51.100.${100 + i}, 172.70.1.5`,
			'cf-connecting-ip': `198.51.100.${100 + i}`
		}));
		expect(statuses.every((s) => s === 200)).toBe(true);
	});

	test('without CF-Connecting-IP the request is served, never a 500', async ({ request }) => {
		// A request that did not come through Cloudflare (local, direct): adapter-node throws
		// for the missing header and the app must fall back to one shared bucket
		const statuses = await hammer(request, (i) => ({ 'x-forwarded-for': `203.0.113.${i}` }));
		expect(statuses).not.toContain(500);
		expect(statuses[0]).toBe(200);
		expect(statuses, 'all header-less requests share one bucket').toContain(429);
		await expectHealthExempt(request, {});
	});
});
