import os
import sys
from datetime import datetime, timezone

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
from services.hazard_alerts import parse_gdacs_events, parse_kmd_alert, parse_kmd_feed

client = TestClient(app)
NOW = datetime(2026, 10, 12, tzinfo=timezone.utc)


def test_gdacs_parser_keeps_current_east_africa_alerts():
    events = parse_gdacs_events({
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [37.0, 0.5]},
                "properties": {
                    "eventtype": "DR",
                    "eventid": 101,
                    "name": "Regional drought",
                    "country": "Kenya, Uganda",
                    "iscurrent": "true",
                    "todate": "2026-11-01T00:00:00",
                    "affectedcountries": [{"iso3": "KEN"}, {"iso3": "UGA"}],
                },
            },
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [150.0, -10.0]},
                "properties": {
                    "eventtype": "EQ",
                    "eventid": 102,
                    "country": "Australia",
                    "iscurrent": "true",
                    "affectedcountries": [{"iso3": "AUS"}],
                },
            },
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [37.0, 0.5]},
                "properties": {
                    "eventtype": "DR",
                    "eventid": 103,
                    "country": "Kenya",
                    "iscurrent": "false",
                    "affectedcountries": [{"iso3": "KEN"}],
                },
            },
        ],
    }, now=NOW)

    assert len(events) == 1
    assert events[0]["headline"] == "Regional drought"
    assert events[0]["coordinates"] == {"latitude": 0.5, "longitude": 37.0}


def test_kmd_cap_parser_extracts_expiry_area_and_instructions():
    alert = b"""<?xml version="1.0"?>
    <cap:alert xmlns:cap="urn:oasis:names:tc:emergency:cap:1.2">
      <cap:identifier>kenya-1</cap:identifier><cap:status>Actual</cap:status>
      <cap:msgType>Alert</cap:msgType><cap:scope>Public</cap:scope>
      <cap:sent>2026-10-11T10:00:00+03:00</cap:sent>
      <cap:info><cap:event>Heavy rainfall</cap:event><cap:headline>Rain warning</cap:headline>
        <cap:severity>Severe</cap:severity><cap:urgency>Expected</cap:urgency>
        <cap:certainty>Likely</cap:certainty><cap:description>Heavy rain expected.</cap:description>
        <cap:instruction>Move away from floodwater.</cap:instruction>
        <cap:effective>2026-10-11T10:00:00+03:00</cap:effective>
        <cap:expires>2026-10-13T10:00:00+03:00</cap:expires>
        <cap:web>https://meteo.go.ke/weather-warnings/rain/</cap:web>
        <cap:area><cap:areaDesc>Nairobi</cap:areaDesc>
          <cap:polygon>-1.0,36.0 -1.0,37.0 -2.0,37.0</cap:polygon>
        </cap:area>
      </cap:info>
    </cap:alert>"""

    parsed = parse_kmd_alert(alert, now=NOW)

    assert parsed is not None
    assert parsed["source"] == "Kenya Meteorological Department"
    assert parsed["areas"] == ["Nairobi"]
    assert parsed["instruction"] == "Move away from floodwater."
    assert parsed["coordinates"] == {
        "latitude": -1.3333333333333333,
        "longitude": 36.666666666666664,
    }
    assert parse_kmd_alert(alert.replace(b"2026-10-13", b"2026-10-10"), now=NOW) is None


def test_kmd_feed_only_returns_first_party_cap_links():
    feed = b"""<rss><channel><lastBuildDate>Sun, 11 Oct 2026 08:00:00 GMT</lastBuildDate>
    <item><title>Warning</title><link>https://meteo.go.ke/api/cap/1.xml</link></item>
    <item><title>External</title><link>https://example.com/api/cap/2.xml</link></item>
    </channel></rss>"""

    published_at, items = parse_kmd_feed(feed)

    assert published_at == datetime(2026, 10, 11, 8, tzinfo=timezone.utc)
    assert [item["title"] for item in items] == ["Warning"]


def test_hazard_feed_requires_authentication():
    response = client.get("/api/v1/hazards/alerts")
    assert response.status_code == 401
