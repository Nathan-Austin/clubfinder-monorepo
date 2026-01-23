const PARTIAL_MATCH_MIN_RATIO = 0.5;
const PARTIAL_MATCH_MIN_CHARS = 5;
const FUZZY_MATCH_SIMILARITY_THRESHOLD = 0.66;
const FUZZY_MATCH_LENGTH_RATIO_THRESHOLD = 0.8;

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

export function isFuzzyMatch(normalizedInput: string, normalizedCandidate: string): boolean {
	const inputCompact = stripSpaces(normalizedInput);
	const candidateCompact = stripSpaces(normalizedCandidate);

	if (!inputCompact || !candidateCompact) {
		return false;
	}

	const maxLength = Math.max(inputCompact.length, candidateCompact.length);
	const minLength = Math.min(inputCompact.length, candidateCompact.length);
	const lengthRatio = minLength / maxLength;

	if (lengthRatio < FUZZY_MATCH_LENGTH_RATIO_THRESHOLD) {
		return false;
	}

	const distance = levenshteinDistance(inputCompact, candidateCompact);
	const similarity = 1 - distance / maxLength;

	return similarity >= FUZZY_MATCH_SIMILARITY_THRESHOLD;
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

export function isWordBoundaryPartialMatch(
	normalizedInput: string,
	normalizedCandidate: string
): boolean {
	const inputLength = stripSpaces(normalizedInput).length;
	const candidateLength = stripSpaces(normalizedCandidate).length;
	const [shorter, longer] =
		inputLength <= candidateLength
			? [normalizedInput, normalizedCandidate]
			: [normalizedCandidate, normalizedInput];

	if (!isWordBoundaryMatch(shorter, longer)) {
		return false;
	}

	return meetsPartialMatchThreshold(shorter, longer);
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
