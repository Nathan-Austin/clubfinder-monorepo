import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = () => {
	const body = `
        User-agent: *
        Disallow: /private/
        Allow: /
    `.trim();

	return new Response(body, {
		status: 200,
		headers: {
			'Content-Type': 'text/plain'
		}
	});
};
