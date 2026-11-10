const PARTIAL_MATCH_MIN_RATIO = 0.5;
const PARTIAL_MATCH_MIN_CHARS = 5;
const FUZZY_MATCH_SIMILARITY_THRESHOLD = 0.66;
const FUZZY_MATCH_LENGTH_RATIO_THRESHOLD = 0.8;

/**
 * The fuzzy pass is meant to absorb typos ("tekno" for "techno"), not to guess at meaning, and
 * on short or multi-word genres it was doing the latter: `funk` matched `punk`, `edm` matched
 * `idm`, `dnb` matched `dub` and `hip hop` matched `trip hop`, each one edit or one word away
 * but a different kind of music (KNOWN_ISSUES 18). Two limits keep it to typos:
 *
 *   - a word shorter than FUZZY_MATCH_MIN_CHARS is never fuzzy-matched, because at three or
 *     four characters a single edit reaches an unrelated genre;
 *   - genres are compared word by word, and must have the same number of words. A typo lands
 *     inside a word ("house" / "hause"); a different genre is a different word ("hip hop" /
 *     "trip hop"), and "hip" is too short to be forgiven on its own.
 *
 * Hyphens count as word separators, so "Hip-Hop/Rap" and "Hip Hop/Rap" still match each other.
 * Genres the fuzzy pass now refuses are still reached by the exact, alias and word-boundary
 * passes, which do not guess.
 */
const FUZZY_MATCH_MIN_CHARS = 5;

export function makeClusterId(cluster: string, subCluster: string): string {
	return JSON.stringify([cluster, subCluster]);
}

export function jaccardSimilarity<T>(setA: Set<T>, setB: Set<T>): number {
	if (setA.size === 0 && setB.size === 0) {
		return 0;
	}

	const [smallSet, largeSet] = setA.size <= setB.size ? [setA, setB] : [setB, setA];
	let intersectionSize = 0;

	for (const value of smallSet) {
		if (largeSet.has(value)) {
			intersectionSize += 1;
		}
	}

	const unionSize = setA.size + setB.size - intersectionSize;
	return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripSpaces(value: string): string {
	return value.replace(/\s+/g, '');
}

function levenshteinDistance(a: string, b: string): number {
	const aLength = a.length;
	const bLength = b.length;

	if (aLength === 0) return bLength;
	if (bLength === 0) return aLength;

	const distances: number[][] = Array.from({ length: aLength + 1 }, () =>
		new Array(bLength + 1).fill(0)
	);

	for (let i = 0; i <= aLength; i += 1) {
		distances[i][0] = i;
	}
	for (let j = 0; j <= bLength; j += 1) {
		distances[0][j] = j;
	}

	for (let i = 1; i <= aLength; i += 1) {
		for (let j = 1; j <= bLength; j += 1) {
			const substitutionCost = a[i - 1] === b[j - 1] ? 0 : 1;
			distances[i][j] = Math.min(
				distances[i - 1][j] + 1,
				distances[i][j - 1] + 1,
				distances[i - 1][j - 1] + substitutionCost
			);
		}
	}

	return distances[aLength][bLength];
}

function splitWords(value: string): string[] {
	return value.replace(/-/g, ' ').split(/\s+/).filter(Boolean);
}

/** How close two single words are, or 0 when the difference is too large to be a typo. */
function wordFuzzyScore(input: string, candidate: string): number {
	const maxLength = Math.max(input.length, candidate.length);
	const minLength = Math.min(input.length, candidate.length);

	if (minLength < FUZZY_MATCH_MIN_CHARS) {
		return 0;
	}

	if (minLength / maxLength < FUZZY_MATCH_LENGTH_RATIO_THRESHOLD) {
		return 0;
	}

	const similarity = 1 - levenshteinDistance(input, candidate) / maxLength;

	return similarity >= FUZZY_MATCH_SIMILARITY_THRESHOLD ? similarity : 0;
}

/**
 * How close two genres are as strings, or 0 when they are not a fuzzy match at all. Lets the
 * caller choose the best candidate rather than the first one an index happens to yield.
 *
 * Word counts must agree and every word must be equal or a typo away from its counterpart; see
 * FUZZY_MATCH_MIN_CHARS for why.
 */
export function fuzzyMatchScore(normalizedInput: string, normalizedCandidate: string): number {
	const inputWords = splitWords(normalizedInput);
	const candidateWords = splitWords(normalizedCandidate);

	if (inputWords.length === 0 || inputWords.length !== candidateWords.length) {
		return 0;
	}

	let total = 0;
	for (let i = 0; i < inputWords.length; i += 1) {
		if (inputWords[i] === candidateWords[i]) {
			total += 1;
			continue;
		}

		const score = wordFuzzyScore(inputWords[i], candidateWords[i]);
		if (score === 0) {
			return 0;
		}
		total += score;
	}

	return total / inputWords.length;
}

export function isFuzzyMatch(normalizedInput: string, normalizedCandidate: string): boolean {
	return fuzzyMatchScore(normalizedInput, normalizedCandidate) > 0;
}

function meetsPartialMatchThreshold(shorter: string, longer: string): boolean {
	const shortLength = stripSpaces(shorter).length;
	const longLength = stripSpaces(longer).length;

	if (shortLength < PARTIAL_MATCH_MIN_CHARS || longLength === 0) {
		return false;
	}

	return shortLength / longLength >= PARTIAL_MATCH_MIN_RATIO;
}

function isWordBoundaryMatch(shorter: string, longer: string): boolean {
	const escaped = escapeRegex(shorter);
	const regex = new RegExp(`\\b${escaped}\\b`);
	return regex.test(longer);
}

/**
 * How much of the longer genre the shorter one covers, or 0 when they do not share a whole word.
 * `house` covers more of `acid house` than of `minimal deep house`, so the first is the better
 * guess; scoring the overlap lets the caller prefer it instead of taking whichever came first.
 */
export function wordBoundaryMatchScore(
	normalizedInput: string,
	normalizedCandidate: string
): number {
	const inputLength = stripSpaces(normalizedInput).length;
	const candidateLength = stripSpaces(normalizedCandidate).length;
	const [shorter, longer] =
		inputLength <= candidateLength
			? [normalizedInput, normalizedCandidate]
			: [normalizedCandidate, normalizedInput];

	if (!isWordBoundaryMatch(shorter, longer)) {
		return 0;
	}

	if (!meetsPartialMatchThreshold(shorter, longer)) {
		return 0;
	}

	return stripSpaces(shorter).length / stripSpaces(longer).length;
}

export function isWordBoundaryPartialMatch(
	normalizedInput: string,
	normalizedCandidate: string
): boolean {
	return wordBoundaryMatchScore(normalizedInput, normalizedCandidate) > 0;
}

export function isGenreMatch(normalizedInput: string, normalizedCandidate: string): boolean {
	if (normalizedInput === normalizedCandidate) {
		return true;
	}

	if (isFuzzyMatch(normalizedInput, normalizedCandidate)) {
		return true;
	}

	return isWordBoundaryPartialMatch(normalizedInput, normalizedCandidate);
}

export function genreOverlap(genres1: string[], genres2: string[]): number {
	if (genres1.length === 0 || genres2.length === 0) {
		return 0;
	}

	const set1 = new Set(genres1.map((genre) => genre.toLowerCase()));
	const set2 = new Set(genres2.map((genre) => genre.toLowerCase()));
	const intersection = new Set([...set1].filter((genre) => set2.has(genre)));

	return intersection.size / Math.max(set1.size, set2.size);
}
