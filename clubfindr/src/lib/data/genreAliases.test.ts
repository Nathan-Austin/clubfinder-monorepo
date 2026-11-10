// Keeps the alias tables honest against genreClusters.json: every key normalised, every target
// a real leaf or a real sub-cluster, every contested leaf given a home, and no table shadowing
// another. Without this an alias silently resolves to nothing and the genre falls through to
// the fuzzy pass, which is exactly what the alias layer exists to avoid (KNOWN_ISSUES 18).

import { describe, expect, it } from 'vitest';
import {
	CANONICAL_HOMES,
	GENRE_ALIASES,
	UMBRELLA_FAMILIES,
	UNSCORED_GENRES,
	UNSCORED_GENRE_SET,
	resolveAlias,
	type ClusterHome
} from './genreAliases';
import { genreClusters } from './validatedGenreClusters';
import { normalizeGenre } from '$lib/server/genreMatching';

type SubClusterNode = {
	name: string;
	genres?: string[] | null;
	sub_clusters?: SubClusterNode[] | null;
};

/** normalised leaf genre → every (cluster, subCluster) genreClusters.json files it under. */
const leafHomes = new Map<string, ClusterHome[]>();
/** Every (cluster, subCluster) pair that exists, as a cluster id. */
const subClusterIds = new Set<string>();

function walk(nodes: SubClusterNode[], cluster: string): void {
	for (const node of nodes) {
		subClusterIds.add(`${cluster}\u0000${node.name}`);
		for (const genre of node.genres ?? []) {
			const key = normalizeGenre(genre);
			const existing = leafHomes.get(key);
			const home = { cluster, subCluster: node.name };
			if (existing) existing.push(home);
			else leafHomes.set(key, [home]);
		}
		if (node.sub_clusters) walk(node.sub_clusters, cluster);
	}
}

for (const cluster of genreClusters.clusters) {
	walk(cluster.sub_clusters as SubClusterNode[], cluster.name);
}

const contestedLeaves = [...leafHomes.entries()]
	.filter(([, homes]) => homes.length > 1)
	.map(([genre]) => genre);

function homeExists(home: ClusterHome): boolean {
	return subClusterIds.has(`${home.cluster}\u0000${home.subCluster}`);
}

describe('alias table keys', () => {
	it('are all in normalizeGenre form', () => {
		const keys = [
			...Object.keys(GENRE_ALIASES),
			...Object.keys(UMBRELLA_FAMILIES),
			...Object.keys(CANONICAL_HOMES),
			...UNSCORED_GENRE_SET
		];
		const unnormalized = keys.filter((key) => normalizeGenre(key) !== key);
		expect(unnormalized).toEqual([]);
	});

	it('do not repeat a genre across the tables', () => {
		// An alias target is resolved before the other tables are consulted, so a genre that is
		// both an alias key and an umbrella/unscored key would make one of them unreachable.
		const aliasKeys = new Set(Object.keys(GENRE_ALIASES));
		const overlaps = [
			...Object.keys(UMBRELLA_FAMILIES),
			...Object.keys(CANONICAL_HOMES),
			...UNSCORED_GENRE_SET
		].filter((key) => aliasKeys.has(key));
		expect(overlaps).toEqual([]);
	});

	it('never map a genre to itself', () => {
		const selfMapped = Object.entries(GENRE_ALIASES).filter(([from, to]) => from === to);
		expect(selfMapped).toEqual([]);
	});
});

describe('GENRE_ALIASES', () => {
	it('resolves every alias to a real leaf, umbrella or unscored genre', () => {
		const unresolved = Object.keys(GENRE_ALIASES).filter((alias) => {
			const target = resolveAlias(alias);
			return (
				!leafHomes.has(target) &&
				UMBRELLA_FAMILIES[target] === undefined &&
				!UNSCORED_GENRE_SET.has(target)
			);
		});
		expect(unresolved).toEqual([]);
	});

	it('does not shadow a genre that is already a leaf', () => {
		// The matcher tries the exact index before resolving aliases, so such a key would be dead
		// weight at best and misleading at worst.
		const shadowing = Object.keys(GENRE_ALIASES).filter((alias) => leafHomes.has(alias));
		expect(shadowing).toEqual([]);
	});

	it('terminates on a cycle rather than looping', () => {
		expect(resolveAlias('dnb')).toBe('drum and bass');
		expect(resolveAlias('nothing-maps-this')).toBe('nothing-maps-this');
	});
});

describe('UMBRELLA_FAMILIES', () => {
	it('names only sub-clusters that exist, each in its own cluster', () => {
		const missing = Object.entries(UMBRELLA_FAMILIES)
			.filter(([, family]) =>
				family.subClusters.some(
					(subCluster) => !homeExists({ cluster: family.cluster, subCluster })
				)
			)
			.map(([genre]) => genre);
		expect(missing).toEqual([]);
	});

	it('lists every member once and never an empty family', () => {
		const broken = Object.entries(UMBRELLA_FAMILIES)
			.filter(
				([, family]) =>
					family.subClusters.length === 0 ||
					new Set(family.subClusters).size !== family.subClusters.length
			)
			.map(([genre]) => genre);
		expect(broken).toEqual([]);
	});

	it('covers the leaf it shadows', () => {
		// An umbrella takes precedence over a leaf of the same name ("techno", "jazz"); that is
		// only safe when the leaf's own home is one of the family members, so the two readings
		// never point apart.
		const divergent = Object.entries(UMBRELLA_FAMILIES)
			.filter(([genre, family]) => {
				const homes = leafHomes.get(genre);
				if (!homes) return false;
				const canonical = CANONICAL_HOMES[genre] ?? homes[0];
				return (
					canonical.cluster !== family.cluster || !family.subClusters.includes(canonical.subCluster)
				);
			})
			.map(([genre]) => genre);
		expect(divergent).toEqual([]);
	});
});

describe('CANONICAL_HOMES', () => {
	it('gives every contested leaf a home', () => {
		const undecided = contestedLeaves.filter((genre) => CANONICAL_HOMES[genre] === undefined);
		expect(undecided).toEqual([]);
	});

	it('only covers leaves that are actually contested', () => {
		const pointless = Object.keys(CANONICAL_HOMES).filter(
			(genre) => (leafHomes.get(genre)?.length ?? 0) < 2
		);
		expect(pointless).toEqual([]);
	});

	it('chooses one of the homes genreClusters.json actually lists', () => {
		const invented = Object.entries(CANONICAL_HOMES)
			.filter(([genre, home]) => {
				const homes = leafHomes.get(genre) ?? [];
				return !homes.some(
					(candidate) =>
						candidate.cluster === home.cluster && candidate.subCluster === home.subCluster
				);
			})
			.map(([genre]) => genre);
		expect(invented).toEqual([]);
	});
});

describe('UNSCORED_GENRES', () => {
	it('lists no genre that already has a home', () => {
		const housed = [...UNSCORED_GENRE_SET].filter(
			(genre) => leafHomes.has(genre) || UMBRELLA_FAMILIES[genre] !== undefined
		);
		expect(housed).toEqual([]);
	});

	it('keeps the two reasons apart', () => {
		const both = UNSCORED_GENRES.noHome.filter((genre) => UNSCORED_GENRES.tooBroad.includes(genre));
		expect(both).toEqual([]);
	});
});
