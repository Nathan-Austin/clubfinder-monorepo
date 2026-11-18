"""Unit tests for the Spotify step's artist selection (KNOWN_ISSUES 92).

Fake database rows only: no live Spotify, no database, no .env files.
"""

import datetime
import uuid

from artist_selection import (
    ARTIST_CANDIDATES_QUERY,
    TIER_REMAINDER,
    TIER_UPCOMING_NO_GENRES,
    TIER_UPCOMING_NO_URI,
    format_selection_summary,
    select_artists_for_run,
)

TODAY = datetime.date(2026, 11, 18)


def day(offset):
    return TODAY + datetime.timedelta(days=offset)


_id_counter = iter(range(1, 10_000))


def row(name, uri=None, has_genres=False, next_event=None, artist_id=None):
    """A fake ARTIST_CANDIDATES_QUERY row, shaped like psycopg2 returns it."""
    if artist_id is None:
        artist_id = uuid.UUID(int=next(_id_counter))
    return (artist_id, name, uri, has_genres, next_event)


def names(selected):
    return [artist.artist_name for artist in selected]


def test_upcoming_artists_without_uri_come_first_soonest_first():
    rows = [
        row("old timer", uri="spotify:artist:a", has_genres=True),
        row("plays saturday", next_event=day(3)),
        row("plays tonight", next_event=day(0)),
    ]
    selected, _ = select_artists_for_run(rows, cap=10)
    assert names(selected) == ["plays tonight", "plays saturday", "old timer"]
    assert selected[0].tier == TIER_UPCOMING_NO_URI
    assert selected[1].tier == TIER_UPCOMING_NO_URI


def test_upcoming_artists_without_genres_come_second():
    rows = [
        row("matched, no genres", uri="spotify:artist:a", next_event=day(2)),
        row("unmatched", next_event=day(5)),
        row(
            "matched with genres",
            uri="spotify:artist:b",
            has_genres=True,
            next_event=day(1),
        ),
    ]
    selected, _ = select_artists_for_run(rows, cap=10)
    assert names(selected) == [
        "unmatched",
        "matched, no genres",
        "matched with genres",
    ]
    assert selected[1].tier == TIER_UPCOMING_NO_GENRES
    assert selected[2].tier == TIER_REMAINDER


def test_artists_without_upcoming_events_fill_the_remainder_by_id():
    first = row("b-name", artist_id=uuid.UUID(int=1))
    second = row("a-name", artist_id=uuid.UUID(int=2))
    selected, _ = select_artists_for_run([second, first], cap=10)
    assert [artist.artist_id for artist in selected] == [
        first[0],
        second[0],
    ]
    assert all(artist.tier == TIER_REMAINDER for artist in selected)


def test_cap_is_enforced_across_tiers_in_order():
    rows = [
        row("rest-{}".format(i), uri="spotify:artist:r{}".format(i), has_genres=True)
        for i in range(5)
    ]
    rows += [row("upcoming-{}".format(i), next_event=day(i)) for i in range(3)]
    selected, counts = select_artists_for_run(rows, cap=4)
    assert len(selected) == 4
    assert names(selected)[:3] == ["upcoming-0", "upcoming-1", "upcoming-2"]
    assert selected[3].tier == TIER_REMAINDER
    assert counts["selected"] == 4
    assert counts["tiers"][TIER_UPCOMING_NO_URI]["selected"] == 3
    assert counts["tiers"][TIER_REMAINDER]["selected"] == 1
    assert counts["tiers"][TIER_REMAINDER]["candidates"] == 5


def test_cap_of_zero_selects_nothing():
    selected, counts = select_artists_for_run([row("anyone")], cap=0)
    assert selected == []
    assert counts["selected"] == 0


def test_recently_called_artists_do_not_spend_the_cap():
    rows = [
        row("checked yesterday", next_event=day(0)),
        row("never checked", next_event=day(1)),
        row("old rest artist", uri="spotify:artist:a", has_genres=True),
    ]
    selected, counts = select_artists_for_run(
        rows, cap=2, recently_called=lambda name: name == "checked yesterday"
    )
    assert names(selected) == ["never checked", "old rest artist"]
    assert counts["skipped_recent"] == 1
    assert counts["tiers"][TIER_UPCOMING_NO_URI]["skipped_recent"] == 1


def test_unusable_rows_are_skipped_and_counted():
    rows = [
        row(""),
        row("   "),
        row(None),
        (None, "no id", None, False, None),
        row("kept"),
    ]
    selected, counts = select_artists_for_run(rows, cap=10)
    assert names(selected) == ["kept"]
    assert counts["skipped_unusable"] == 4


def test_artist_names_keep_their_commas():
    selected, _ = select_artists_for_run(
        [row("Me, Myself & I", next_event=day(0))], cap=10
    )
    assert names(selected) == ["Me, Myself & I"]


def test_counts_report_every_tier():
    rows = [
        row("unmatched", next_event=day(0)),
        row("no genres", uri="spotify:artist:a", next_event=day(0)),
        row("rest", uri="spotify:artist:b", has_genres=True),
    ]
    _, counts = select_artists_for_run(rows, cap=10)
    assert counts["cap"] == 10
    for tier in (TIER_UPCOMING_NO_URI, TIER_UPCOMING_NO_GENRES, TIER_REMAINDER):
        assert counts["tiers"][tier]["candidates"] == 1
        assert counts["tiers"][tier]["selected"] == 1
        assert counts["tiers"][tier]["label"]


def test_summary_names_the_city_and_every_tier():
    rows = [
        row("unmatched", next_event=day(0)),
        row("rest", uri="spotify:artist:a", has_genres=True),
    ]
    _, counts = select_artists_for_run(rows, cap=5)
    summary = format_selection_summary("london", counts)
    assert "london" in summary
    assert "2 of cap 5 selected" in summary
    assert "Tier 1" in summary and "Tier 2" in summary and "Tier 3" in summary
    assert "no Spotify URI" in summary


def test_query_is_parameterized_and_upcoming_only():
    assert ARTIST_CANDIDATES_QUERY.count("%s") == 1
    assert "event_date >= CURRENT_DATE" in ARTIST_CANDIDATES_QUERY
    # The per-run cap lives in Python, not the SQL
    assert "LIMIT" not in ARTIST_CANDIDATES_QUERY.upper()
