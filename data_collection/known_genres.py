"""The genres the matcher knows, and whether a Spotify match fits the night it plays.

`known_genres.json` is written by the web app's `pnpm convert-genres` (clubfindr): every genre
the cluster matcher places without guessing, mapped to its top-level cluster. Two uses here
(KNOWN_ISSUES 94):

- `clean_genres`: only these names reach artists and events. The old pass kept anything in a
  6,428-entry CSV and fuzzy-matched substrings, so tags the matcher cannot place ("coco") and
  worse were stored and shown.
- `fits_line_up`: a Spotify name search takes its top result, and a DJ who shares a name with a
  hardcore band imported that band's genres into every night they played. A candidate's genres
  must share a top-level cluster with what is already known about the line-up (the other
  artists' genres, the event's own tags); when nothing fits, the match is treated as the wrong
  artist (owner's decision 2026-11-19) and nothing of it is kept.

Pure functions, no database and no network.
"""

import json
import os
import re
from functools import lru_cache

KNOWN_GENRES_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "known_genres.json"
)


def normalize_genre(genre):
    """`normalizeGenre` of the web's matcher: lower case, '&' as 'and', single spaces."""
    text = str(genre).lower().strip()
    text = re.sub(r"\s*&\s*", " and ", text)
    text = re.sub(r"\s*/\s*", " / ", text)
    text = text.replace("'", "").replace('"', "")
    return re.sub(r"\s+", " ", text).strip()


def _compact(genre):
    return re.sub(r"[\s-]+", "", genre)


@lru_cache(maxsize=4)
def load_known_genres(path=KNOWN_GENRES_FILE):
    """{normalized genre: top-level cluster}, from known_genres.json."""
    with open(path, "r", encoding="utf-8") as handle:
        data = json.load(handle)
    return dict(data["genres"])


@lru_cache(maxsize=4)
def _compact_index(path=KNOWN_GENRES_FILE):
    index = {}
    for genre in load_known_genres(path):
        index.setdefault(_compact(genre), genre)
    return index


def clean_genres(raw, known=None, path=KNOWN_GENRES_FILE):
    """The known genres among `raw` (a list, or a string split on , | /), normalized, sorted.

    A name is kept when the matcher knows it as written, or ignoring spaces and hyphens
    ("TechHouse" -> "tech house"). Anything else is dropped, "none" included.
    """
    if not raw:
        return []
    known = load_known_genres(path) if known is None else known
    compact_index = (
        _compact_index(path)
        if known is load_known_genres(path)
        else {_compact(g): g for g in known}
    )
    items = raw if isinstance(raw, list) else re.split(r"\s*[,|/]\s*", str(raw))
    kept = set()
    for item in items:
        if not item:
            continue
        normalized = normalize_genre(item)
        if not normalized or normalized == "none":
            continue
        if normalized in known:
            kept.add(normalized)
            continue
        match = compact_index.get(_compact(normalized))
        if match:
            kept.add(match)
    return sorted(kept)


def top_clusters(genres, known=None, path=KNOWN_GENRES_FILE):
    """The top-level clusters of the known genres among `genres`."""
    known = load_known_genres(path) if known is None else known
    return {known[g] for g in (normalize_genre(x) for x in genres or []) if g in known}


def fits_line_up(
    candidate_genres, reference_genres, known=None, path=KNOWN_GENRES_FILE
):
    """Whether a Spotify match's genres fit the night(s) the artist plays.

    `reference_genres` is what is already known about the line-up: the other artists' genres
    and the events' own tags (never the candidate artist's own stored genres, which may be the
    very pollution being judged). Returns (fits, reason).
    """
    known = load_known_genres(path) if known is None else known
    candidate = top_clusters(candidate_genres, known)
    reference = top_clusters(reference_genres, known)
    if not reference:
        return True, "nothing known about the line-up yet"
    if not candidate:
        return True, "no known genres to judge the match by"
    shared = candidate & reference
    if shared:
        return True, "shares " + ", ".join(sorted(shared))
    return False, (
        "candidate clusters "
        + ", ".join(sorted(candidate))
        + " vs line-up clusters "
        + ", ".join(sorted(reference))
    )
