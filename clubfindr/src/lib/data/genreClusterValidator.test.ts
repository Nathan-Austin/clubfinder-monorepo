import { describe, it, expect } from 'vitest';
import { validateGenreClusters, validateAndLoad } from './genreClusterValidator';

describe('validateGenreClusters', () => {
	describe('valid structures', () => {
		it('validates a minimal valid structure', () => {
			const data = {
				clusters: [
					{
						name: 'Electronic',
						sub_clusters: [
							{
								name: 'Techno',
								genres: ['Techno', 'Detroit Techno']
							}
						]
					}
				]
			};

			const result = validateGenreClusters(data);
			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
			expect(result.stats.totalClusters).toBe(1);
			expect(result.stats.totalSubClusters).toBe(1);
			expect(result.stats.totalGenres).toBe(2);
		});

		it('validates nested sub-clusters', () => {
			const data = {
				clusters: [
					{
						name: 'Electronic',
						sub_clusters: [
							{
								name: 'Ambient',
								sub_clusters: [
									{
										name: 'Pure Ambient',
										genres: ['Ambient', 'Drone']
									},
									{
										name: 'Rhythmic Ambient',
										genres: ['Ambient Techno']
									}
								]
							}
						]
					}
				]
			};

			const result = validateGenreClusters(data);
			expect(result.valid).toBe(true);
			expect(result.stats.maxDepth).toBe(2);
			expect(result.stats.totalSubClusters).toBe(3); // 1 parent + 2 children
			expect(result.stats.totalGenres).toBe(3);
		});

		it('validates clusters with optional genres at parent level', () => {
			const data = {
				clusters: [
					{
						name: 'Electronic',
						genres: ['Electronic'],
						sub_clusters: [
							{
								name: 'Techno',
								genres: ['Techno']
							}
						]
					}
				]
			};

			const result = validateGenreClusters(data);
			expect(result.valid).toBe(true);
			expect(result.stats.totalGenres).toBe(2);
		});
	});

	describe('invalid root structure', () => {
		it('rejects null data', () => {
			const result = validateGenreClusters(null);
			expect(result.valid).toBe(false);
			expect(result.errors).toHaveLength(1);
			expect(result.errors[0].message).toContain('null or undefined');
		});

		it('rejects undefined data', () => {
			const result = validateGenreClusters(undefined);
			expect(result.valid).toBe(false);
			expect(result.errors[0].message).toContain('null or undefined');
		});

		it('rejects non-object data', () => {
			const result = validateGenreClusters('invalid');
			expect(result.valid).toBe(false);
			expect(result.errors[0].message).toContain('Expected object');
		});

		it('rejects missing clusters property', () => {
			const result = validateGenreClusters({ invalid: [] });
			expect(result.valid).toBe(false);
			expect(result.errors[0].message).toContain('Missing required "clusters"');
		});

		it('rejects non-array clusters', () => {
			const result = validateGenreClusters({ clusters: 'invalid' });
			expect(result.valid).toBe(false);
			expect(result.errors[0].message).toContain('Expected array');
		});
	});

	describe('cluster validation', () => {
		it('rejects cluster without name', () => {
			const data = {
				clusters: [
					{
						sub_clusters: []
					}
				]
			};

			const result = validateGenreClusters(data);
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.message.includes('Missing required "name"'))).toBe(true);
		});

		it('rejects cluster with non-string name', () => {
			const data = {
				clusters: [
					{
						name: 123,
						sub_clusters: []
					}
				]
			};

			const result = validateGenreClusters(data);
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.message.includes('Expected string'))).toBe(true);
		});

		it('rejects cluster with empty name', () => {
			const data = {
				clusters: [
					{
						name: '   ',
						sub_clusters: []
					}
				]
			};

			const result = validateGenreClusters(data);
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.message.includes('cannot be empty'))).toBe(true);
		});

		it('rejects main cluster without sub_clusters', () => {
			const data = {
				clusters: [
					{
						name: 'Electronic',
						genres: ['Electronic']
					}
				]
			};

			const result = validateGenreClusters(data);
			expect(result.valid).toBe(false);
			expect(
				result.errors.some((e) =>
					e.message.includes('Main cluster missing required "sub_clusters"')
				)
			).toBe(true);
		});

		it('rejects non-array sub_clusters', () => {
			const data = {
				clusters: [
					{
						name: 'Electronic',
						sub_clusters: 'invalid'
					}
				]
			};

			const result = validateGenreClusters(data);
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.path.includes('sub_clusters'))).toBe(true);
		});
	});

	describe('genre validation', () => {
		it('rejects non-array genres', () => {
			const data = {
				clusters: [
					{
						name: 'Electronic',
						sub_clusters: [
							{
								name: 'Techno',
								genres: 'Techno'
							}
						]
					}
				]
			};

			const result = validateGenreClusters(data);
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.path.includes('genres'))).toBe(true);
		});

		it('rejects non-string genre entries', () => {
			const data = {
				clusters: [
					{
						name: 'Electronic',
						sub_clusters: [
							{
								name: 'Techno',
								genres: ['Techno', 123, 'House']
							}
						]
					}
				]
			};

			const result = validateGenreClusters(data);
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.path.includes('genres[1]'))).toBe(true);
		});

		it('warns about empty genre names', () => {
			const data = {
				clusters: [
					{
						name: 'Electronic',
						sub_clusters: [
							{
								name: 'Techno',
								genres: ['Techno', '   ', 'House']
							}
						]
					}
				]
			};

			const result = validateGenreClusters(data);
			expect(result.valid).toBe(true); // Still valid, just a warning
			expect(result.warnings.some((w) => w.message.includes('empty'))).toBe(true);
		});

		it('warns about duplicate genres', () => {
			const data = {
				clusters: [
					{
						name: 'Electronic',
						sub_clusters: [
							{
								name: 'Techno',
								genres: ['Techno', 'House', 'Techno']
							}
						]
					}
				]
			};

			const result = validateGenreClusters(data);
			expect(result.valid).toBe(true);
			expect(result.warnings.some((w) => w.message.includes('duplicate'))).toBe(true);
		});
	});

	describe('warnings', () => {
		it('warns about empty clusters array', () => {
			const data = { clusters: [] };

			const result = validateGenreClusters(data);
			expect(result.valid).toBe(true); // Valid structure, just empty
			expect(result.warnings.some((w) => w.message.includes('empty'))).toBe(true);
		});

		it('warns about empty sub_clusters array', () => {
			const data = {
				clusters: [
					{
						name: 'Electronic',
						sub_clusters: []
					}
				]
			};

			const result = validateGenreClusters(data);
			expect(result.valid).toBe(true);
			expect(result.warnings.some((w) => w.message.includes('empty'))).toBe(true);
		});

		it('warns about sub-cluster with neither genres nor sub_clusters', () => {
			const data = {
				clusters: [
					{
						name: 'Electronic',
						sub_clusters: [
							{
								name: 'Techno'
							}
						]
					}
				]
			};

			const result = validateGenreClusters(data);
			expect(result.valid).toBe(true);
			expect(
				result.warnings.some((w) => w.message.includes('neither "genres" nor "sub_clusters"'))
			).toBe(true);
		});
	});

	describe('statistics', () => {
		it('calculates correct statistics for complex structure', () => {
			const data = {
				clusters: [
					{
						name: 'Electronic',
						genres: ['Electronic'],
						sub_clusters: [
							{
								name: 'Ambient',
								sub_clusters: [
									{
										name: 'Pure Ambient',
										genres: ['Ambient', 'Drone']
									}
								]
							},
							{
								name: 'Techno',
								genres: ['Techno', 'Detroit Techno', 'Minimal Techno']
							}
						]
					},
					{
						name: 'Rock',
						sub_clusters: [
							{
								name: 'Indie Rock',
								genres: ['Indie Rock']
							}
						]
					}
				]
			};

			const result = validateGenreClusters(data);
			expect(result.valid).toBe(true);
			expect(result.stats.totalClusters).toBe(2);
			expect(result.stats.totalSubClusters).toBe(4); // Ambient, Pure Ambient, Techno, Indie Rock
			expect(result.stats.totalGenres).toBe(7); // 1 + 2 + 3 + 1
			expect(result.stats.maxDepth).toBe(2);
		});
	});
});

describe('validateAndLoad', () => {
	it('returns data for valid structure', () => {
		const data = {
			clusters: [
				{
					name: 'Electronic',
					sub_clusters: [
						{
							name: 'Techno',
							genres: ['Techno']
						}
					]
				}
			]
		};

		const result = validateAndLoad(data);
		expect(result).toEqual(data);
		expect(result.clusters).toHaveLength(1);
	});

	it('throws error for invalid structure', () => {
		const data = {
			clusters: [
				{
					// Missing name
					sub_clusters: []
				}
			]
		};

		expect(() => validateAndLoad(data)).toThrow('Genre clusters validation failed');
	});

	it('throws error with detailed message for multiple errors', () => {
		const data = {
			clusters: [
				{
					name: '',
					// Missing sub_clusters
					genres: 'invalid'
				}
			]
		};

		expect(() => validateAndLoad(data)).toThrow();
	});
});
