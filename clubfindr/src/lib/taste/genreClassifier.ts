// "Is this tag a genre we know?" for the Last.fm import, answered by the existing /clubs
// classifier: a tag counts as a genre when findClusters() places it in a real cluster
// (exact, fuzzy or word-boundary match) rather than the Uncategorized fallback. Imported
// from the route module on purpose, so the matcher itself is not touched or duplicated;
// moving findClusters into $lib is part of the matcher unification follow-up.

import { _findClusters } from '../../routes/clubs/+page.server';
import type { GenreClassifier } from './lastfm';

export const isKnownGenre: GenreClassifier = (tag) => {
	const [entry] = _findClusters([tag]);
	return !!entry && entry.cluster !== 'Uncategorized';
};
