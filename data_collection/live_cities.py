"""The covered cities (live_cities.txt) and the check that a fetcher run matches one.

Every event the fetcher saves is labelled with the city name given on its command line, and
RA is asked for the area code given beside it. If the two disagree ("berlin" with Amsterdam's
area 29), every event of that run is stored under the wrong city, and the nightly run does not
repair the label (the events upsert keyed on the RA event id). Found 2026-11-19 when /clubs
showed Amsterdam's clubs under a Berlin heading (KNOWN_ISSUES 93). `data_collection.py`
always passes a line of live_cities.txt; this module lets a run by hand be held to the same
list.

Pure functions, no database and no network.
"""

import os

LIVE_CITIES_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)), "live_cities.txt"
)


def parse_live_cities(text):
    """Parse live_cities.txt lines ("Name - Code - Country") into dicts.

    Names and country codes are lower-cased, codes are ints; malformed lines are skipped,
    as `data_collection.load_cities_from_file` does.
    """
    cities = []
    for line in text.splitlines():
        parts = line.strip().split(" - ")
        if len(parts) != 3:
            continue
        name, code, country = parts
        try:
            code = int(code.strip())
        except ValueError:
            continue
        cities.append(
            {
                "name": name.strip().lower(),
                "code": code,
                "country": country.strip().lower(),
            }
        )
    return cities


def load_live_cities(path=LIVE_CITIES_FILE):
    with open(path, "r", encoding="utf-8") as handle:
        return parse_live_cities(handle.read())


class CityAreaMismatch(ValueError):
    """The city name, RA area code and country code of a run do not belong together."""


def check_city_area(city_name, area_code, country_code, cities):
    """Raise CityAreaMismatch unless (city_name, area_code, country_code) is a covered city.

    The comparison ignores case and surrounding spaces. The message names the listed values
    so a run by hand can be corrected.
    """
    name = (city_name or "").strip().lower()
    country = (country_code or "").strip().lower()
    listed = next((city for city in cities if city["name"] == name), None)
    if listed is None:
        known = ", ".join(sorted(city["name"] for city in cities)) or "none"
        raise CityAreaMismatch(
            f"'{city_name}' is not a covered city (live_cities.txt lists: {known}); "
            "events would be saved under a city nothing reads"
        )
    if listed["code"] != int(area_code) or listed["country"] != country:
        raise CityAreaMismatch(
            f"'{city_name}' is RA area {listed['code']} in '{listed['country']}' "
            f"(live_cities.txt), not area {area_code} in '{country_code}': every event of "
            "this run would be saved under the wrong city"
        )
    return listed
