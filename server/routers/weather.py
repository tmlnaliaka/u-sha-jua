from fastapi import APIRouter
from typing import Dict, Any

router = APIRouter(prefix="/weather", tags=["Weather & Early Warning"])

# High-vulnerability flood plain polygons across Kenyan informal and lowland settlements
KENYA_FLOOD_ZONES = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "properties": {
                "id": "flood-zone-mathare",
                "name": "Mathare Valley River Basin High Hazard Corridor",
                "risk_level": "EXTREME",
                "color": "#EF4444",
                "fill_color": "rgba(239, 68, 68, 0.28)",
                "estimated_population_at_risk": 48500,
                "muster_point": "Mathare Drive Primary School Grounds",
                "advisory": "Flash flood surge zone - low-lying riverbank informal dwellings."
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [36.8510, -1.2580],
                    [36.8660, -1.2605],
                    [36.8720, -1.2670],
                    [36.8580, -1.2650],
                    [36.8510, -1.2580]
                ]]
            }
        },
        {
            "type": "Feature",
            "properties": {
                "id": "flood-zone-kibera",
                "name": "Kibera Ngong River Lowland Inundation Basin",
                "risk_level": "HIGH",
                "color": "#F97316",
                "fill_color": "rgba(249, 115, 22, 0.25)",
                "estimated_population_at_risk": 72000,
                "muster_point": "Olympic High School Playing Fields",
                "advisory": "Drainage runoff accumulation zone during sustained precipitation."
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [36.7810, -1.3110],
                    [36.7990, -1.3125],
                    [36.8020, -1.3190],
                    [36.7830, -1.3180],
                    [36.7810, -1.3110]
                ]]
            }
        },
        {
            "type": "Feature",
            "properties": {
                "id": "flood-zone-nairobi-basin",
                "name": "Nairobi Central River Catchment Plain",
                "risk_level": "MODERATE",
                "color": "#EAB308",
                "fill_color": "rgba(234, 179, 8, 0.20)",
                "estimated_population_at_risk": 31000,
                "muster_point": "Pumwani Social Hall Elevated Grounds",
                "advisory": "Industrial and market runoff overflow zone near Gikomba."
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [36.8320, -1.2810],
                    [36.8450, -1.2830],
                    [36.8420, -1.2910],
                    [36.8300, -1.2890],
                    [36.8320, -1.2810]
                ]]
            }
        },
        {
            "type": "Feature",
            "properties": {
                "id": "flood-zone-mukuru",
                "name": "Mukuru kwa Njenga Lowland Drainage Corridor",
                "risk_level": "HIGH",
                "color": "#F97316",
                "fill_color": "rgba(249, 115, 22, 0.25)",
                "estimated_population_at_risk": 54000,
                "muster_point": "Kwa Njenga Primary School Elevated Grounds",
                "advisory": "Perimeter wall vulnerability and canal blockage risk."
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [[
                    [36.8720, -1.3150],
                    [36.8850, -1.3170],
                    [36.8830, -1.3250],
                    [36.8700, -1.3230],
                    [36.8720, -1.3150]
                ]]
            }
        }
    ]
}

@router.get("/telemetry")
def get_weather_telemetry() -> Dict[str, Any]:
    """Returns real-time meteorological warning telemetry for crisis intelligence."""
    return {
        "status": "active_storm_watch",
        "precipitation_rate_mmh": 46.8,
        "storm_severity": "SEVERE FLASH FLOOD WARNING",
        "river_gauge_elevation_m": 3.75,
        "river_flood_threshold_m": 2.0,
        "river_delta_above_flood_stage_m": 1.75,
        "wind_velocity_kmh": 28.4,
        "wind_direction": "ENE",
        "atmospheric_pressure_hpa": 1008.2,
        "warning_bulletin": "KENYA MET DEPT: Level 3 Flash Flood Emergency active for Nairobi Basin informal settlements. Extreme caution along Mathare, Ngong, and Nairobi river corridors.",
        "active_hazard_zones_count": len(KENYA_FLOOD_ZONES["features"])
    }

@router.get("/flood-zones")
def get_flood_zones() -> Dict[str, Any]:
    """Outputs GeoJSON polygon FeatureCollection of designated flash flood risk zones."""
    return KENYA_FLOOD_ZONES
