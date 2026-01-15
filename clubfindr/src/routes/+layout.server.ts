// src/routes/+layout.server.ts
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ cookies }) => {
	const promoterId = cookies.get('promoterId');
	const barEmail = cookies.get('bar_email');

	return {
		isLoggedIn: cookies.get('isLoggedIn') === 'true',
		isPartnerLoggedIn: Boolean(promoterId || barEmail)
	};
};
