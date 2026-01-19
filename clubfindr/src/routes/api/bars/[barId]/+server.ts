// src/routes/api/bars/[id]/+server.ts
import { json } from '@sveltejs/kit';
import { query } from '$lib/db';
import type { RequestHandler } from './$types';
import { validateBarUpdate } from '$lib/validators/barValidators';
/**
 * GET handler to fetch bar details
 */
export const GET: RequestHandler = async ({ params, cookies }) => {
	try {
		const barId = params.barId;
		console.log('GET request for bar ID:', barId);

		if (!barId) {
			console.error('No barId provided in URL params');
			return json(
				{
					message: 'Bar ID is required'
				},
				{ status: 400 }
			);
		}

		// For security, ensure the user has access to this bar's data
		const userBarId = cookies.get('barId');
		console.log('User bar ID from cookie:', userBarId);

		// During development/debugging, we'll be more lenient with this check
		// You can make it strict again after debugging by removing this bypass
		if (userBarId !== barId) {
			console.log(
				"Warning: cookie barId doesn't match requested barId - continuing anyway for debugging"
			);
			// In production, you would return a 403 here

			/* In production, uncomment this:
			return json(
				{ 
					message: 'Unauthorized access to bar details' 
				}, 
				{ status: 403 }
			);
			*/
		}

		const result = await query(
			`SELECT 
				id, 
				name, 
				address, 
				city, 
				phone, 
				general_email,  
				description, 
				updated_at 
			FROM clubfindr.bars 
			WHERE id = $1`,
			[barId]
		);

		if (!result?.rows?.length) {
			console.log(`Bar with ID ${barId} not found in database`);
			return json(
				{
					message: 'Bar not found'
				},
				{ status: 404 }
			);
		}

		console.log(`Successfully retrieved bar with ID ${barId}`);
		return json(result.rows[0]);
	} catch (error) {
		console.error('Error in GET handler', error);
		return json(
			{
				message: 'An unexpected error occurred'
			},
			{ status: 500 }
		);
	}
};

// Add this after your GET handler
/**
 * PATCH handler to update bar details
 */
export const PATCH: RequestHandler = async ({ params, cookies, request }) => {
	try {
		const barId = params.barId;
		console.log('PATCH request for bar ID:', barId);

		if (!barId) {
			console.error('No barId provided in URL params');
			return json(
				{
					message: 'Bar ID is required'
				},
				{ status: 400 }
			);
		}

		// For security, ensure the user has access to this bar's data
		const userBarId = cookies.get('barId');
		console.log('User bar ID from cookie:', userBarId);

		// During development/debugging, we'll be more lenient with this check
		if (userBarId !== barId) {
			console.log(
				"Warning: cookie barId doesn't match requested barId - continuing anyway for debugging"
			);
			// In production, you would return a 403 here

			/* In production, uncomment this:
			return json(
				{ 
					message: 'Unauthorized access to update bar details' 
				}, 
				{ status: 403 }
			);
			*/
		}

		// Parse the request body
		const data = await request.json();
		console.log('Update data received:', data);

		// Validate the input data
		const validationErrors = validateBarUpdate(data);
		if (validationErrors.length > 0) {
			console.log('Validation errors:', validationErrors);
			return json(
				{
					message: 'Validation failed',
					errors: validationErrors
				},
				{ status: 400 }
			);
		}

		// Prepare the update query
		const updateFields = ['name', 'address', 'city', 'phone', 'general_email', 'description'];

		// Create a filtered object with only valid fields
		const updateData: Record<string, unknown> = {};
		updateFields.forEach((field) => {
			if (data[field] !== undefined) {
				updateData[field] = data[field];
			}
		});

		// Add updated_at timestamp
		updateData['updated_at'] = new Date().toISOString();

		// Build the SQL query dynamically
		const fields = Object.keys(updateData);
		const values = Object.values(updateData) as (string | number | boolean | null)[];

		if (fields.length === 0) {
			return json(
				{
					message: 'No valid fields to update'
				},
				{ status: 400 }
			);
		}

		const setClause = fields.map((field, index) => `${field} = $${index + 2}`).join(', ');
		const sql = `UPDATE clubfindr.bars SET ${setClause} WHERE id = $1 RETURNING id, name, updated_at`;

		// Execute the update
		console.log('Executing SQL:', sql);
		console.log('With parameters:', [barId, ...values]);
		const result = await query(sql, [barId, ...values]);

		if (!result?.rows?.length) {
			console.log('Update failed - no rows returned');
			return json(
				{
					message: 'Failed to update bar details'
				},
				{ status: 500 }
			);
		}

		console.log('Update successful, returned row:', result.rows[0]);

		// If the bar name changed, update it in the cookie
		if (data.name && cookies.get('barsName') !== data.name) {
			cookies.set('barsName', data.name, {
				path: '/',
				httpOnly: false,
				secure: true,
				sameSite: 'lax',
				maxAge: 30 * 24 * 60 * 60 // 30 days
			});
		}

		// If the city changed, update it in the cookie
		if (data.city && cookies.get('bar_city') !== data.city) {
			cookies.set('bar_city', data.city, {
				path: '/',
				httpOnly: false,
				secure: true,
				sameSite: 'lax',
				maxAge: 30 * 24 * 60 * 60 // 30 days
			});
		}

		return json({
			message: 'Bar details updated successfully',
			bar: {
				id: result.rows[0].id,
				name: result.rows[0].name,
				updated_at: result.rows[0].updated_at
			}
		});
	} catch (error: unknown) {
		console.error('Error updating bar details:', error);
		return json(
			{
				message: 'Failed to update bar details',
				error: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
