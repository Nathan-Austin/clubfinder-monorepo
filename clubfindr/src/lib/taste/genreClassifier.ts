// "Is this tag a genre we know?" for the Last.fm import, answered by the shared cluster
// matcher: a tag counts as a genre when findClusters() places it in a real cluster (exact,
// fuzzy or word-boundary match) rather than the Uncategorized fallback.

import { findClusters } from '$lib/server/genreMatching';
import type { GenreClassifier } from './lastfm';

export const isKnownGenre: GenreClassifier = (tag) => {
	const [entry] = findClusters([tag]);
	return !!entry && entry.cluster !== 'Uncategorized';
};
