import pytest
from server.services.nlp_service import (
    is_within_kenya_jurisdiction,
    KENYA_BBOX,
    DEFAULT_COORDINATES,
    nlp_service
)

def test_kenya_bounding_box_constants():
    """Validates the sovereign territory and border emergency buffer coordinates for Kenya."""
    assert KENYA_BBOX["min_lat"] == -5.5
    assert KENYA_BBOX["max_lat"] == 5.8
    assert KENYA_BBOX["min_lon"] == 33.0
    assert KENYA_BBOX["max_lon"] == 42.5
    
    # Nairobi metropolitan center coordinates
    assert DEFAULT_COORDINATES[0] == -1.286389
    assert DEFAULT_COORDINATES[1] == 36.817223
    assert "Kenya" in DEFAULT_COORDINATES[2]

def test_kenya_major_towns_within_jurisdiction():
    """Asserts that all major Kenyan cities and crisis hotspots fall inside operational jurisdiction."""
    kenyan_locations = [
        {"name": "Nairobi Central", "lat": -1.286389, "lon": 36.817223},
        {"name": "Mombasa Coast", "lat": -4.043477, "lon": 39.668206},
        {"name": "Kisumu Lake Basin", "lat": -0.102217, "lon": 34.761713},
        {"name": "Nakuru Rift Valley", "lat": -0.303099, "lon": 36.080026},
        {"name": "Eldoret Uasin Gishu", "lat": 0.514277, "lon": 35.269780},
        {"name": "Lodwar Turkana", "lat": 3.119100, "lon": 35.597300},
        {"name": "Mandera Northeast", "lat": 3.937300, "lon": 41.856900},
        {"name": "Garissa Eastern", "lat": -0.453200, "lon": 39.646000},
        {"name": "Mathare Valley", "lat": -1.261200, "lon": 36.858400},
        {"name": "Kibera Basin", "lat": -1.313300, "lon": 36.784400},
    ]

    for loc in kenyan_locations:
        assert is_within_kenya_jurisdiction(loc["lat"], loc["lon"]) is True, (
            f"Location {loc['name']} ({loc['lat']}, {loc['lon']}) should be inside Kenya"
        )

def test_border_disaster_buffer_permitted():
    """Asserts that immediate cross-border emergency corridors are permitted by the boundary buffer."""
    border_zones = [
        {"name": "Budalangi/Busia Border (Uganda)", "lat": 0.1200, "lon": 33.9500},
        {"name": "Namanga/Longido Border (Tanzania)", "lat": -2.5500, "lon": 36.7800},
        {"name": "Moyale Border (Ethiopia)", "lat": 3.5300, "lon": 39.0500},
        {"name": "Lunga Lunga Border (Tanzania)", "lat": -4.5500, "lon": 39.1200},
    ]

    for zone in border_zones:
        assert is_within_kenya_jurisdiction(zone["lat"], zone["lon"]) is True, (
            f"Cross-border zone {zone['name']} should be permitted in operational buffer"
        )

def test_out_of_jurisdiction_coordinates_rejected():
    """Asserts that coordinates in foreign nations outside the Kenya buffer are strictly rejected."""
    foreign_locations = [
        {"name": "Cairo, Egypt", "lat": 30.0444, "lon": 31.2357},
        {"name": "Johannesburg, South Africa", "lat": -26.2041, "lon": 28.0473},
        {"name": "London, UK", "lat": 51.5074, "lon": -0.1278},
        {"name": "New York, USA", "lat": 40.7128, "lon": -74.0060},
        {"name": "Tokyo, Japan", "lat": 35.6762, "lon": 139.6503},
    ]

    for loc in foreign_locations:
        assert is_within_kenya_jurisdiction(loc["lat"], loc["lon"]) is False, (
            f"Foreign location {loc['name']} ({loc['lat']}, {loc['lon']}) must be rejected"
        )

@pytest.mark.asyncio
async def test_nlp_service_clamps_out_of_bounds_device_coordinates():
    """Verifies that NLP extraction clamps out-of-jurisdiction GPS coordinates back to Kenyan territory."""
    # Pass a London coordinate as device GPS
    london_lat = 51.5074
    london_lon = -0.1278
    
    result = await nlp_service.extract_distress_report(
        raw_text="Flood waters rising rapidly in informal settlement",
        device_lat=london_lat,
        device_lon=london_lon
    )
    
    # Coordinates must be clamped inside Kenya
    assert is_within_kenya_jurisdiction(result.latitude, result.longitude) is True
    # If device was foreign, it falls back to Nairobi Central
    assert result.latitude == DEFAULT_COORDINATES[0]
    assert result.longitude == DEFAULT_COORDINATES[1]

@pytest.mark.asyncio
async def test_nlp_service_preserves_valid_kenya_coordinates():
    """Verifies that NLP extraction preserves genuine Kenyan coordinates."""
    mombasa_lat = -4.0435
    mombasa_lon = 39.6682
    
    result = await nlp_service.extract_distress_report(
        raw_text="High tide flooding near Likoni ferry",
        device_lat=mombasa_lat,
        device_lon=mombasa_lon
    )
    
    assert result.latitude == pytest.approx(mombasa_lat, rel=1e-3)
    assert result.longitude == pytest.approx(mombasa_lon, rel=1e-3)
    assert is_within_kenya_jurisdiction(result.latitude, result.longitude) is True
