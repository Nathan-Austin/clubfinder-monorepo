// The genre alias layer (KNOWN_ISSUES 18).
//
// `genreClusters.json` is a tree of ~1000 leaf genres, but the tags that actually arrive from
// Spotify, Last.fm, MusicBrainz and the scrapers are mostly *umbrella* terms — "house", "rock",
// "hip hop", "metal", "trance" — which are sub-cluster names rather than leaves, or are spelling
// variants of a leaf ("dnb", "rnb", "hip-hop"). Before this layer existed they fell through the
// exact pass into the fuzzy pass, which produced false friends (funk → punk, hip hop → trip hop,
// dnb → dub, country → Hip-Hop/Rap "Latin and Regional Variants"), or landed in Uncategorized,
// which scoring ignores.
//
// Four tables, applied in `$lib/server/genreMatching` before any fuzzy guessing:
//
//   GENRE_ALIASES    spelling variants and synonyms → another genre string (a leaf, an umbrella
//                    key, or another alias; chains are resolved).
//   UMBRELLA_HOMES   a broad genre that is not a leaf → the sub-cluster it should count as.
//   CANONICAL_HOMES  a leaf that `genreClusters.json` lists under several sub-clusters → the one
//                    home it resolves to, so the answer does not depend on JSON order.
//   UNSCORED_GENRES  genres that are real but have nowhere sensible to go, or are too broad to
//                    mean anything. These resolve straight to Uncategorized instead of being
//                    guessed at. See the note at the bottom.
//
// Every key is in `normalizeGenre` form: lower case, `&` spelled "and", no apostrophes, single
// spaces, ` / ` around slashes. `genreAliases.test.ts` enforces that, and that every target
// names something real.

export type ClusterHome = { cluster: string; subCluster: string };

/** Spelling variants and synonyms. Values may themselves be aliases; chains are resolved. */
export const GENRE_ALIASES: Record<string, string> = {
	// Drum & bass. The leaf is "Drum & Bass", which normalises to "drum and bass".
	dnb: 'drum and bass',
	'd and b': 'drum and bass',
	dandb: 'drum and bass',
	'drum n bass': 'drum and bass',
	drumnbass: 'drum and bass',
	breakbeat: 'drum and bass',
	breaks: 'drum and bass',

	// R&B. The leaf is "R&B" → "r and b".
	rnb: 'r and b',
	'r n b': 'r and b',
	'rhythm and blues': 'r and b',

	// Hip hop.
	'hip-hop': 'hip hop',
	hiphop: 'hip hop',
	rap: 'hip hop',
	'rap music': 'hip hop',
	triphop: 'trip hop',
	'trip-hop': 'trip hop',
	'boom-bap': 'boom bap',

	// House and techno spelling variants.
	'house music': 'house',
	'tech-house': 'tech house',
	'deep-house': 'deep house',
	'afro-house': 'afro house',
	afrohouse: 'afro house',
	'acid-house': 'acid house',
	'progressive-house': 'progressive house',
	'minimal-techno': 'minimal techno',
	'hard-techno': 'hard techno',
	'detroit-techno': 'detroit techno',

	// Trance.
	'psy trance': 'psytrance',
	'psy-trance': 'psytrance',
	'goa-trance': 'goa trance',

	// Garage: in a club context this is UK garage, not garage rock. Garage rock arrives spelled
	// out ("garage rock", "garage rock revival") and keeps its own leaf.
	garage: 'uk garage',
	'uk-garage': 'uk garage',
	ukg: 'uk garage',

	// Bass and dubstep.
	'dub-step': 'dubstep',

	// Hard dance.
	'happy-hardcore': 'happy hardcore',

	// Rock, metal and punk variants.
	'nu-metal': 'nu metal',
	'heavy-metal': 'metal',
	'heavy metal': 'metal',
	'rock and roll': 'rock n roll',
	rocknroll: 'rock n roll',
	'synth pop': 'synthpop',
	'synth-pop': 'synthpop',
	'post punk': 'post-punk',
	'new-wave': 'new wave',

	// Reggae and Caribbean.
	'roots reggae': 'reggae',
	'reggae music': 'reggae',

	// Latin.
	'rock en espanol': 'rock en español',
	reggaetón: 'reggaeton',
	'latin-house': 'latin house',

	// World.
	'world music': 'world',
	worldbeat: 'world beat',

	// Pop, soul, funk, disco, jazz, African pop, classical and folk — all leaves of their own
	// clusters since 2026-11-10, so these are ordinary spelling variants now.
	'afro beats': 'afrobeats',
	'afro-beats': 'afrobeats',
	'afro beat': 'afrobeat',
	'k pop': 'k-pop',
	kpop: 'k-pop',
	'j pop': 'j-pop',
	jpop: 'j-pop',
	'c pop': 'c-pop',
	cpop: 'c-pop',
	'nu-disco': 'nu disco',
	nudisco: 'nu disco',
	'italo-disco': 'italo disco',
	'neo-soul': 'neo soul',
	neosoul: 'neo soul',
	'soul music': 'soul',
	'jazz music': 'jazz',
	'pop music': 'pop',
	'classical music': 'classical',
	'folk music': 'folk',
	'gospel music': 'gospel',
	'p funk': 'p-funk',
	pfunk: 'p-funk',
	'nu-jazz': 'nu jazz',
	'jazz funk': 'jazz-funk',
	'coupé-décalé': 'coupe-decale',
	'coupe decale': 'coupe-decale',
	'singer songwriter': 'singer-songwriter'
};

/**
 * Broad genres that are not leaves of `genreClusters.json`, and the sub-cluster each should
 * count as. These are the most common tags the providers return, so getting them to a plausible
 * cluster matters more than getting them to a perfect one.
 *
 * An umbrella necessarily loses detail: "house" is placed in Classic House, so a user who says
 * "house" matches venues tagged house, deep house, acid house or disco house, but not the
 * Modern House or Cultural House sub-clusters. Spreading an umbrella across every sub-cluster of
 * its family needs the scoring change tracked in KNOWN_ISSUES 32 — otherwise the extra clusters
 * inflate the similarity denominator and a user who names only umbrellas scores worse than one
 * who names specifics.
 */
export const UMBRELLA_HOMES: Record<string, ClusterHome> = {
	// Electronic.
	house: { cluster: 'Electronic/Dance (EDM)', subCluster: 'Classic House' },
	trance: { cluster: 'Electronic/Dance (EDM)', subCluster: 'Trance Variants' },
	edm: { cluster: 'Electronic/Dance (EDM)', subCluster: 'Modern House' },
	bass: { cluster: 'Electronic/Dance (EDM)', subCluster: 'Dubstep and Bass' },

	// Rock family. `genreClusters.json` carries two overlapping rock trees — "Rock Music" and
	// "Alternative Rock and Punk" — and the fuller one is "Rock Music", so the umbrellas and the
	// contested leaves below both resolve there. Merging the two clusters is a taxonomy change,
	// not an alias one.
	rock: { cluster: 'Rock Music', subCluster: 'Classic Rock' },
	metal: { cluster: 'Rock Music', subCluster: 'Heavy Metal' },
	// Without this, a bare "indie" word-boundary-matched into Alternative Rock and Punk while
	// "indie rock" and "shoegaze" resolve to Rock Music, so the two scored nothing against each
	// other. The same mismatch remains for the other leaves that are unique to the alternative
	// tree (emo, for one), and only merging the two trees fixes it properly.
	indie: { cluster: 'Rock Music', subCluster: 'Alternative Rock' },

	// Hip hop.
	'hip hop': { cluster: 'Hip-Hop/Rap', subCluster: 'East Coast, West Coast, and Midwest' },

	// Roots.
	reggae: { cluster: 'Reggae and Roots', subCluster: 'Roots Reggae Foundations' },
	soca: { cluster: 'Reggae and Roots', subCluster: 'Caribbean Roots Music' },
	blues: { cluster: 'Blues', subCluster: 'Post-War Blues' },
	country: { cluster: 'Country', subCluster: 'Traditional and Classic Country' },
	latin: { cluster: 'Latin/Latino Music', subCluster: 'Classic Latin' },
	world: { cluster: 'Electronic Folk Fusion', subCluster: 'World Music Fusion' }
};

/**
 * Leaves that `genreClusters.json` lists under more than one sub-cluster (92 of them). Without
 * an entry here the winner is whichever the JSON happens to list first, so `deep house` counted
 * as Classic House and `reggaeton` as Reggae rather than Urban Latino.
 *
 * The rules used, in order:
 *   - "Rock Music" wins over "Alternative Rock and Punk" (the two overlapping rock trees).
 *   - The more specific cluster wins over the more general one: Industrial over Rock,
 *     Latin/Latino over Electronic, Country and Blues over Reggae-and-Roots' folk sub-cluster,
 *     Experimental/Avant-Garde over Electronic.
 *   - Within one cluster, the more specific sub-cluster wins (`tech house` → Deep/Tech House
 *     rather than Minimal and Techno).
 */
export const CANONICAL_HOMES: Record<string, ClusterHome> = {
	// --- Alternative Rock and Punk vs Rock Music: Rock Music wins ---
	'alternative metal': { cluster: 'Rock Music', subCluster: 'Modern Hard and Heavy' },
	'anarcho-punk': { cluster: 'Rock Music', subCluster: 'Punk and Hardcore' },
	'art punk': { cluster: 'Rock Music', subCluster: 'Experimental and Post-Rock' },
	'art rock': { cluster: 'Rock Music', subCluster: 'Art and Progressive' },
	'avant-rock': { cluster: 'Rock Music', subCluster: 'Art and Progressive' },
	c86: { cluster: 'Rock Music', subCluster: 'Alternative Rock' },
	'college rock': { cluster: 'Rock Music', subCluster: 'Alternative Rock' },
	'crossover thrash': { cluster: 'Rock Music', subCluster: 'Modern Hard and Heavy' },
	'crust punk': { cluster: 'Rock Music', subCluster: 'Punk and Hardcore' },
	'd-beat': { cluster: 'Rock Music', subCluster: 'Punk and Hardcore' },
	'experimental rock': { cluster: 'Rock Music', subCluster: 'Experimental and Post-Rock' },
	'garage rock': { cluster: 'Rock Music', subCluster: 'Early Rock and Roll' },
	grunge: { cluster: 'Rock Music', subCluster: 'Alternative Rock' },
	'hardcore punk': { cluster: 'Rock Music', subCluster: 'Punk and Hardcore' },
	'indie rock': { cluster: 'Rock Music', subCluster: 'Alternative Rock' },
	'instrumental rock': { cluster: 'Rock Music', subCluster: 'Experimental and Post-Rock' },
	krautrock: { cluster: 'Rock Music', subCluster: 'Art and Progressive' },
	'math rock': { cluster: 'Rock Music', subCluster: 'Alternative Rock' },
	'neo-psychedelia': { cluster: 'Rock Music', subCluster: 'Alternative Rock' },
	'noise rock': { cluster: 'Rock Music', subCluster: 'Alternative Rock' },
	'post-grunge': { cluster: 'Rock Music', subCluster: 'Contemporary Rock' },
	'post-hardcore': { cluster: 'Rock Music', subCluster: 'Modern Hard and Heavy' },
	'post-metal': { cluster: 'Rock Music', subCluster: 'Experimental and Post-Rock' },
	'post-punk': { cluster: 'Rock Music', subCluster: 'Punk and Hardcore' },
	'post-rock': { cluster: 'Rock Music', subCluster: 'Experimental and Post-Rock' },
	'progressive rock': { cluster: 'Rock Music', subCluster: 'Art and Progressive' },
	'proto-punk': { cluster: 'Rock Music', subCluster: 'Punk and Hardcore' },
	'psychedelic rock': { cluster: 'Rock Music', subCluster: 'Classic Rock' },
	screamo: { cluster: 'Rock Music', subCluster: 'Modern Hard and Heavy' },
	shoegaze: { cluster: 'Rock Music', subCluster: 'Alternative Rock' },
	'space rock': { cluster: 'Rock Music', subCluster: 'Art and Progressive' },
	'street punk': { cluster: 'Rock Music', subCluster: 'Punk and Hardcore' },
	'surf rock': { cluster: 'Rock Music', subCluster: 'Early Rock and Roll' },
	'blues rock': { cluster: 'Rock Music', subCluster: 'Classic Rock' },

	// --- Industrial wins over the rock trees ---
	'industrial metal': { cluster: 'Industrial', subCluster: 'Industrial Rock and Metal' },
	'industrial rock': { cluster: 'Industrial', subCluster: 'Industrial Rock and Metal' },
	noise: { cluster: 'Industrial', subCluster: 'Traditional Industrial' },

	// --- Goth stays with the goth tree ---
	darkwave: { cluster: 'Alternative Rock and Punk', subCluster: 'Gothic Rock' },
	'gothic metal': { cluster: 'Alternative Rock and Punk', subCluster: 'Gothic Rock' },

	// --- Latin/Latino wins over Electronic and Reggae ---
	reggaeton: { cluster: 'Latin/Latino Music', subCluster: 'Reggaeton' },
	'latin house': { cluster: 'Latin/Latino Music', subCluster: 'Latin House and Club' },
	'brazilian bass': { cluster: 'Latin/Latino Music', subCluster: 'Latin House and Club' },
	'tropical bass': {
		cluster: 'Latin/Latino Music',
		subCluster: 'Electronic Cumbia and Tropical'
	},

	// --- Country and Blues win over Reggae-and-Roots' folk sub-cluster ---
	americana: { cluster: 'Country', subCluster: 'Progressive Country' },
	bluegrass: { cluster: 'Country', subCluster: 'Bluegrass and Related' },
	'traditional country': { cluster: 'Country', subCluster: 'Traditional and Classic Country' },
	cowpunk: { cluster: 'Country', subCluster: 'Alt-Country and Insurgent Country' },
	'delta blues': { cluster: 'Blues', subCluster: 'Pre-War Blues' },

	// --- Experimental/Avant-Garde wins over Electronic for sound-art leaves ---
	'sound art': { cluster: 'Experimental/Avant-Garde', subCluster: 'Sound Art' },
	electroacoustic: { cluster: 'Experimental/Avant-Garde', subCluster: 'Sound Art' },
	'field recordings': { cluster: 'Experimental/Avant-Garde', subCluster: 'Sound Art' },

	// --- Indie Pop keeps the pop leaves ---
	'bedroom pop': { cluster: 'Indie Pop', subCluster: 'Dream Pop and Bedroom Pop' },
	'dream pop': { cluster: 'Indie Pop', subCluster: 'Dream Pop and Bedroom Pop' },
	'indie folk': { cluster: 'Indie Pop', subCluster: 'Indie Folk Pop' },
	'noise pop': { cluster: 'Indie Pop', subCluster: 'Lo-Fi Indie Pop' },
	'modern folk': { cluster: 'Indie Pop', subCluster: 'Indie Folk Pop' },

	// --- Psychedelia ---
	'psych folk': { cluster: 'Neo-Psychedelia', subCluster: 'Modern Psychedelic' },
	'psychedelic folk': { cluster: 'Neo-Psychedelia', subCluster: 'Modern Psychedelic' },
	'psychedelic pop': { cluster: 'Neo-Psychedelia', subCluster: 'Modern Psychedelic' },
	'space electronic': { cluster: 'Neo-Psychedelia', subCluster: 'Electronic Psychedelia' },
	psytrance: { cluster: 'Electronic/Dance (EDM)', subCluster: 'Trance Variants' },

	// --- Electronic internal contests, and the electronic/other contests that stay electronic ---
	'ambient dub': { cluster: 'Electronic/Dance (EDM)', subCluster: 'Pure Ambient' },
	'dark ambient': { cluster: 'Electronic/Dance (EDM)', subCluster: 'Pure Ambient' },
	drone: { cluster: 'Electronic/Dance (EDM)', subCluster: 'Pure Ambient' },
	'glitch hop': {
		cluster: 'Electronic/Dance (EDM)',
		subCluster: 'IDM and Experimental Rhythmic Music'
	},
	'experimental techno': {
		cluster: 'Electronic/Dance (EDM)',
		subCluster: 'IDM and Experimental Rhythmic Music'
	},
	'industrial techno': {
		cluster: 'Electronic/Dance (EDM)',
		subCluster: 'Dark and Industrial Techno'
	},
	'deep house': { cluster: 'Electronic/Dance (EDM)', subCluster: 'Deep/Tech House' },
	'tech house': { cluster: 'Electronic/Dance (EDM)', subCluster: 'Deep/Tech House' },
	microhouse: { cluster: 'Electronic/Dance (EDM)', subCluster: 'Deep/Tech House' },
	'bass house': { cluster: 'Electronic/Dance (EDM)', subCluster: 'Modern House' },
	'bass music': { cluster: 'Electronic/Dance (EDM)', subCluster: 'Dubstep and Bass' },
	'future bass': { cluster: 'Electronic/Dance (EDM)', subCluster: 'Future Bass and Beats' },
	'night bass': { cluster: 'Electronic/Dance (EDM)', subCluster: 'Experimental Bass' },
	'uk bass': { cluster: 'Electronic/Dance (EDM)', subCluster: 'Experimental Bass' },
	'detroit techno': { cluster: 'Electronic/Dance (EDM)', subCluster: 'Regional Techno Styles' },

	// --- Fusion clusters ---
	'broken beat': { cluster: 'Modern Fusion', subCluster: 'Jazz-Electronic Fusion' },
	'global bass': { cluster: 'Electronic Folk Fusion', subCluster: 'World Music Fusion' },
	'world beat': { cluster: 'Electronic Folk Fusion', subCluster: 'World Music Fusion' },

	// --- Industrial internal contests ---
	aggrotech: { cluster: 'Industrial', subCluster: 'Aggrotech and Dark Electro' },
	'dark electro': { cluster: 'Industrial', subCluster: 'Aggrotech and Dark Electro' },
	'harsh ebm': { cluster: 'Industrial', subCluster: 'Aggrotech and Dark Electro' },
	'industrial dance': { cluster: 'Industrial', subCluster: 'Industrial Dance' },

	// --- Indie Pop internal contests ---
	'art pop': { cluster: 'Indie Pop', subCluster: 'Chamber Pop' },
	'baroque pop': { cluster: 'Indie Pop', subCluster: 'Chamber Pop' },
	'chamber pop': { cluster: 'Indie Pop', subCluster: 'Chamber Pop' },
	'diy pop': { cluster: 'Indie Pop', subCluster: 'Lo-Fi Indie Pop' },
	'lo-fi pop': { cluster: 'Indie Pop', subCluster: 'Lo-Fi Indie Pop' },

	// --- Remaining internal contests ---
	'melodic trap': { cluster: 'Hip-Hop/Rap', subCluster: 'Modern Trap and Drill' },
	'modern blues': { cluster: 'Blues', subCluster: 'Contemporary Blues' },

	// --- Leaves the new clusters took over from an older home (2026-11-10) ---
	// R&B sat in Hip-Hop/Rap "Pop Rap and Melodic Rap" because that was the only sub-cluster
	// naming it. It belongs with soul.
	'r and b': { cluster: 'Soul, Funk and Disco', subCluster: 'Contemporary R&B' },
	// Electropop reads as mainstream pop far more often than as the indie synth-pop of
	// "Synth-Based Indie Pop", which keeps its own, more specific leaves.
	electropop: { cluster: 'Pop', subCluster: 'Electronic Pop' },
	'cumbia norteña': { cluster: 'Latin/Latino Music', subCluster: 'Cumbia Variants' },
	mambo: { cluster: 'Latin/Latino Music', subCluster: 'Merengue and Dominican Styles' }
};

/**
 * Genres that resolve straight to Uncategorized, skipping the fuzzy and word-boundary passes.
 *
 * Two kinds, and both are better off carrying no weight than being guessed at, because
 * `calculateClusterSimilarity` drops Uncategorized from both sides — a genre here neither
 * matches anything nor dilutes a score, whereas a wrong cluster actively misranks venues.
 *
 * `noHome`: real, common genres that `genreClusters.json` has no cluster for at all. This list is
 * empty: pop, soul, funk, disco, jazz, afrobeats, classical, gospel, k-pop, schlager and folk
 * were all on it until the Pop, "Soul, Funk and Disco", Jazz, "African Popular Music", Classical
 * and "Folk and Singer-Songwriter" clusters were added on 2026-11-10, and they are leaves now.
 * The mechanism stays for the next genre that turns out to have nowhere to go: put it here and it
 * carries no weight instead of being guessed at, and it is still written to missing-genres.txt so
 * the genre-maintenance script keeps reporting it.
 *
 * `tooBroad`: tags that name no style at all. Placing them anywhere invents a preference the
 * user never expressed.
 */
export const UNSCORED_GENRES: { noHome: string[]; tooBroad: string[] } = {
	noHome: [],
	tooBroad: [
		'electronic',
		'dance',
		'dance music',
		'music',
		'club',
		'club music',
		'party',
		'various',
		'other',
		'mixed',
		'live',
		'dj',
		'dj set',
		'alternative',
		'underground',
		'experimental',
		'instrumental',
		'acoustic',
		'vocal',
		'remix',
		'edit',
		'bootleg'
	]
};

export const UNSCORED_GENRE_SET = new Set<string>([
	...UNSCORED_GENRES.noHome,
	...UNSCORED_GENRES.tooBroad
]);

/** Whether an unscored genre should still be reported to missing-genres.txt. */
export const NO_HOME_GENRE_SET = new Set<string>(UNSCORED_GENRES.noHome);

/**
 * Follow `GENRE_ALIASES` to a final genre string. Chains are resolved up to a small depth and a
 * cycle simply stops, returning the last value reached.
 */
export function resolveAlias(normalizedGenre: string): string {
	let current = normalizedGenre;
	const seen = new Set<string>([current]);

	for (let i = 0; i < 8; i += 1) {
		const next = GENRE_ALIASES[current];
		if (next === undefined || next === current || seen.has(next)) {
			return current;
		}
		seen.add(next);
		current = next;
	}

	return current;
}
