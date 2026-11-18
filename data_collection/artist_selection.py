"""Choose which artists the Spotify step checks in one run (KNOWN_ISSUES 92).

The old query took a city's first 1,000 artists by id, so in a big city each
run spent its lookups on old artists while the ones playing upcoming events
stayed unmatched. The selection now fills a per-run cap in three tiers:

1. Artists playing an upcoming event with no ``spotify_uri`` (soonest first)
2. Artists playing an upcoming event with a URI but no genres (soonest first)
3. The rest of the city's artists, by id (the old order)

Artists checked within the cooldown window are skipped before the cap is
spent, so the cap buys new lookups rather than repeats. This module is pure
Python over already-fetched rows, so it is unit-testable with fake rows; the
SQL below is the only database-facing part.
"""

from dataclasses import dataclass

# One row per artist of the city: id, name, spotify_uri, whether any genres
# are stored, and the soonest upcoming event date (NULL when there is none).
ARTIST_CANDIDATES_QUERY = """
    SELECT
        a.id,
        a.artist_name,
        a.spotify_uri,
        COALESCE(array_length(a.genres, 1), 0) > 0 AS has_genres,
        MIN(e.event_date) FILTER (WHERE e.event_date >= CURRENT_DATE)
            AS next_event_date
    FROM clubfindr.artists a
    LEFT JOIN clubfindr.event_artists ea ON ea.artist_id = a.id
    LEFT JOIN clubfindr.events e ON e.id = ea.event_id
    WHERE a.primary_city = %s
    GROUP BY a.id
    ORDER BY a.id;
"""

TIER_UPCOMING_NO_URI = 1
TIER_UPCOMING_NO_GENRES = 2
TIER_REMAINDER = 3

TIER_LABELS = {
    TIER_UPCOMING_NO_URI: "upcoming events, no Spotify URI",
    TIER_UPCOMING_NO_GENRES: "upcoming events, URI but no genres",
    TIER_REMAINDER: "no upcoming events needing a check",
}


@dataclass(frozen=True)
class SelectedArtist:
    artist_id: object
    artist_name: str
    spotify_uri: "str | None"  # string form keeps Python 3.9 importable
    tier: int


def _never_called(_name):
    return False


def select_artists_for_run(rows, cap, recently_called=None):
    """Pick the artists one run should check against Spotify.

    ``rows`` are ``ARTIST_CANDIDATES_QUERY`` result tuples:
    ``(id, artist_name, spotify_uri, has_genres, next_event_date)``.
    ``recently_called`` is a predicate on the artist name (the cooldown).

    Returns ``(selected, counts)``: the artists to check, in tier order
    (tiers 1 and 2 soonest event first), and the per-tier numbers for the
    run log.
    """
    if recently_called is None:
        recently_called = _never_called

    tiers = {tier: [] for tier in TIER_LABELS}
    skipped_recent = {tier: 0 for tier in TIER_LABELS}
    skipped_unusable = 0

    for artist_id, artist_name, spotify_uri, has_genres, next_event_date in rows:
        name = (artist_name or "").strip()
        if not artist_id or not name:
            skipped_unusable += 1
            continue

        if next_event_date is not None and not spotify_uri:
            tier = TIER_UPCOMING_NO_URI
        elif next_event_date is not None and not has_genres:
            tier = TIER_UPCOMING_NO_GENRES
        else:
            tier = TIER_REMAINDER

        if recently_called(name):
            skipped_recent[tier] += 1
            continue

        sort_key = (
            (next_event_date, str(artist_id))
            if tier != TIER_REMAINDER
            else (str(artist_id),)
        )
        tiers[tier].append(
            (sort_key, SelectedArtist(artist_id, name, spotify_uri, tier))
        )

    selected = []
    selected_per_tier = {tier: 0 for tier in TIER_LABELS}
    for tier in sorted(TIER_LABELS):
        tiers[tier].sort(key=lambda item: item[0])
        remaining = max(cap - len(selected), 0)
        taken = [artist for _, artist in tiers[tier][:remaining]]
        selected.extend(taken)
        selected_per_tier[tier] = len(taken)

    counts = {
        "cap": cap,
        "selected": len(selected),
        "skipped_recent": sum(skipped_recent.values()),
        "skipped_unusable": skipped_unusable,
        "tiers": {
            tier: {
                "label": TIER_LABELS[tier],
                "candidates": len(tiers[tier]),
                "selected": selected_per_tier[tier],
                "skipped_recent": skipped_recent[tier],
            }
            for tier in sorted(TIER_LABELS)
        },
    }
    return selected, counts


def format_selection_summary(city_name, counts):
    """One log line per tier plus a total, for the run log."""
    lines = [
        "Artist selection for {}: {} of cap {} selected "
        "({} skipped by cooldown, {} unusable rows)".format(
            city_name,
            counts["selected"],
            counts["cap"],
            counts["skipped_recent"],
            counts["skipped_unusable"],
        )
    ]
    for tier in sorted(counts["tiers"]):
        tier_counts = counts["tiers"][tier]
        lines.append(
            "  Tier {} ({}): {} selected of {} candidates, "
            "{} skipped by cooldown".format(
                tier,
                tier_counts["label"],
                tier_counts["selected"],
                tier_counts["candidates"],
                tier_counts["skipped_recent"],
            )
        )
    return "\n".join(lines)
