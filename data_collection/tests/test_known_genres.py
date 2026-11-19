"""Only genres the matcher knows reach the data, and a Spotify match must fit its line-up
(KNOWN_ISSUES 94). Pure functions over the committed known_genres.json; no network, no database.
"""

from known_genres import (
    clean_genres,
    fits_line_up,
    load_known_genres,
    normalize_genre,
    top_clusters,
)

KNOWN = {
    "techno": "Electronic/Dance (EDM)",
    "minimal techno": "Electronic/Dance (EDM)",
    "deep house": "Electronic/Dance (EDM)",
    "tech house": "Electronic/Dance (EDM)",
    "hardcore punk": "Rock Music",
    "post-punk": "Rock Music",
    "german hip hop": "Hip-Hop/Rap",
    "drum and bass": "Electronic/Dance (EDM)",
}


def test_normalize_matches_the_web_matcher():
    assert normalize_genre("  Drum & Bass ") == "drum and bass"
    assert normalize_genre("Post-Punk") == "post-punk"
    assert normalize_genre("Rock'n'Roll") == "rocknroll"


def test_clean_keeps_known_names_only_and_drops_none_and_garbage():
    raw = ["Techno", "none", "coco", "TechHouse", "zorbcore", "", "Deep House"]
    assert clean_genres(raw, KNOWN) == ["deep house", "tech house", "techno"]


def test_clean_splits_a_string_and_dedupes():
    assert clean_genres("techno, Techno | tech house / nonsense", KNOWN) == [
        "tech house",
        "techno",
    ]
    assert clean_genres([], KNOWN) == []
    assert clean_genres(None, KNOWN) == []


def test_the_committed_file_knows_the_owners_case_and_not_the_garbage():
    known = load_known_genres()
    assert len(known) > 1200
    assert known["hardcore punk"] == "Rock Music"
    assert known["techno"] == "Electronic/Dance (EDM)"
    assert "coco" not in known and "none" not in known
    assert clean_genres(["Hardcore Punk", "coco", "none"]) == ["hardcore punk"]


def test_top_clusters_ignores_unknown_genres():
    assert top_clusters(["techno", "coco", "Post-Punk"], KNOWN) == {
        "Electronic/Dance (EDM)",
        "Rock Music",
    }
    assert top_clusters(["coco"], KNOWN) == set()


def test_a_match_sharing_a_cluster_with_the_line_up_fits():
    fits, why = fits_line_up(
        ["deep house", "tech house"], ["techno", "minimal techno"], KNOWN
    )
    assert fits and "Electronic/Dance (EDM)" in why


def test_the_hardcore_band_on_a_techno_night_is_refused():
    fits, why = fits_line_up(
        ["hardcore punk", "post-punk"], ["techno", "deep house"], KNOWN
    )
    assert not fits
    assert "Rock Music" in why and "Electronic/Dance (EDM)" in why


def test_nothing_known_about_the_line_up_accepts_the_match():
    assert fits_line_up(["hardcore punk"], [], KNOWN)[0]
    assert fits_line_up(["hardcore punk"], ["coco", "none"], KNOWN)[0]


def test_a_match_with_no_known_genres_is_not_judged():
    assert fits_line_up(["coco"], ["techno"], KNOWN)[0]
