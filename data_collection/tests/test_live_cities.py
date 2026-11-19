"""The guard against saving a run's events under the wrong city (KNOWN_ISSUES 93).

Pure functions over strings: no database, no network, no .env files.
"""

import pytest

from live_cities import (
    LIVE_CITIES_FILE,
    CityAreaMismatch,
    check_city_area,
    load_live_cities,
    parse_live_cities,
)

SAMPLE = """London - 13 - uk
Berlin - 34 - de
Amsterdam - 29 - nl

not a city line
Oslo - abc - no
"""


def test_parse_lower_cases_names_and_skips_malformed_lines():
    assert parse_live_cities(SAMPLE) == [
        {"name": "london", "code": 13, "country": "uk"},
        {"name": "berlin", "code": 34, "country": "de"},
        {"name": "amsterdam", "code": 29, "country": "nl"},
    ]


def test_the_real_file_parses_to_distinct_cities_and_areas():
    cities = load_live_cities(LIVE_CITIES_FILE)
    assert len(cities) >= 9
    assert len({city["name"] for city in cities}) == len(cities)
    assert len({city["code"] for city in cities}) == len(cities)


def test_a_matching_run_passes_whatever_the_case():
    cities = parse_live_cities(SAMPLE)
    assert check_city_area("Berlin", 34, "DE", cities)["name"] == "berlin"
    assert check_city_area(" berlin ", "34", "de", cities)["code"] == 34


def test_a_city_with_another_areas_code_is_refused():
    cities = parse_live_cities(SAMPLE)
    with pytest.raises(CityAreaMismatch) as refused:
        check_city_area("berlin", 29, "nl", cities)
    message = str(refused.value)
    assert "area 34" in message and "area 29" in message
    assert "wrong city" in message


def test_the_right_area_with_the_wrong_country_is_refused():
    cities = parse_live_cities(SAMPLE)
    with pytest.raises(CityAreaMismatch):
        check_city_area("berlin", 34, "nl", cities)


def test_an_unlisted_city_is_refused_and_the_list_is_named():
    cities = parse_live_cities(SAMPLE)
    with pytest.raises(CityAreaMismatch) as refused:
        check_city_area("rome", 100, "it", cities)
    assert "amsterdam, berlin, london" in str(refused.value)
