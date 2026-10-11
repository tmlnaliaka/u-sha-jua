import asyncio
import email.utils
import logging
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)

GDACS_URL = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"
KMD_RSS_URL = "https://meteo.go.ke/api/cap/rss.xml"
KMD_HOST = "meteo.go.ke"
EAST_AFRICAN_ISO3 = {
    "BDI", "COD", "DJI", "ERI", "ETH", "KEN", "RWA", "SOM", "SSD", "TZA", "UGA"
}
CACHE_SECONDS = 300
_cache: tuple[float, dict[str, Any]] | None = None
_cache_lock = asyncio.Lock()


def _parse_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        try:
            parsed = email.utils.parsedate_to_datetime(value)
        except (TypeError, ValueError, OverflowError):
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _text(node: ET.Element, name: str) -> str | None:
    for child in node.iter():
        if child.tag.rsplit("}", 1)[-1] == name and child.text:
            return child.text.strip()
    return None


def _parse_polygon_centroid(value: str | None) -> dict[str, float] | None:
    if not value:
        return None
    points: list[tuple[float, float]] = []
    for pair in value.split():
        parts = pair.split(",")
        if len(parts) != 2:
            continue
        try:
            latitude, longitude = float(parts[0]), float(parts[1])
        except ValueError:
            continue
        if -90 <= latitude <= 90 and -180 <= longitude <= 180:
            points.append((latitude, longitude))
    if not points:
        return None
    return {
        "latitude": sum(point[0] for point in points) / len(points),
        "longitude": sum(point[1] for point in points) / len(points),
    }


def parse_kmd_alert(xml_content: bytes, now: datetime | None = None) -> dict[str, Any] | None:
    root = ET.fromstring(xml_content)
    current_time = now or datetime.now(timezone.utc)
    if _text(root, "status") != "Actual" or _text(root, "scope") != "Public":
        return None
    if _text(root, "msgType") == "Cancel":
        return None

    info = next((element for element in root.iter() if element.tag.rsplit("}", 1)[-1] == "info"), None)
    if info is None:
        return None
    expires_at = _parse_datetime(_text(info, "expires"))
    if expires_at and expires_at <= current_time:
        return None

    areas: list[str] = []
    centroids: list[dict[str, float]] = []
    for area in info.iter():
        if area.tag.rsplit("}", 1)[-1] != "area":
            continue
        area_name = _text(area, "areaDesc")
        if area_name and area_name not in areas:
            areas.append(area_name)
        for child in area.iter():
            if child.tag.rsplit("}", 1)[-1] == "polygon":
                centroid = _parse_polygon_centroid(child.text)
                if centroid:
                    centroids.append(centroid)

    centroid = None
    if centroids:
        centroid = {
            "latitude": sum(point["latitude"] for point in centroids) / len(centroids),
            "longitude": sum(point["longitude"] for point in centroids) / len(centroids),
        }

    return {
        "id": _text(root, "identifier") or _text(root, "sender") or "kmd-alert",
        "source": "Kenya Meteorological Department",
        "headline": _text(info, "headline") or _text(info, "event") or "Weather warning",
        "event": _text(info, "event") or "Weather warning",
        "severity": _text(info, "severity") or "Unknown",
        "urgency": _text(info, "urgency") or "Unknown",
        "certainty": _text(info, "certainty") or "Unknown",
        "description": _text(info, "description") or "",
        "instruction": _text(info, "instruction"),
        "areas": areas,
        "coordinates": centroid,
        "issued_at": _text(root, "sent"),
        "effective_at": _text(info, "effective") or _text(info, "onset"),
        "expires_at": _text(info, "expires"),
        "source_url": _text(info, "web") or "https://meteo.go.ke/weather-warnings/",
        "alert_level": _text(info, "severity") or "Unknown",
    }


def parse_gdacs_events(payload: dict[str, Any], now: datetime | None = None) -> list[dict[str, Any]]:
    if not isinstance(payload, dict) or not isinstance(payload.get("features"), list):
        return []
    current_time = now or datetime.now(timezone.utc)
    events: list[dict[str, Any]] = []
    for feature in payload.get("features", []):
        if not isinstance(feature, dict):
            continue
        properties = feature.get("properties")
        if not isinstance(properties, dict):
            continue
        if str(properties.get("iscurrent", "")).lower() != "true":
            continue
        countries = properties.get("affectedcountries") or []
        affected_iso3 = {
            country.get("iso3")
            for country in countries
            if isinstance(country, dict) and isinstance(country.get("iso3"), str)
        }
        country_text = str(properties.get("country", "")).lower()
        if not affected_iso3.intersection(EAST_AFRICAN_ISO3) and "kenya" not in country_text:
            continue
        expires_at = _parse_datetime(properties.get("todate"))
        if expires_at and expires_at < current_time:
            continue

        geometry = feature.get("geometry") or {}
        coordinates = geometry.get("coordinates") or []
        point = None
        if geometry.get("type") == "Point" and len(coordinates) >= 2:
            try:
                longitude, latitude = float(coordinates[0]), float(coordinates[1])
                if -90 <= latitude <= 90 and -180 <= longitude <= 180:
                    point = {"latitude": latitude, "longitude": longitude}
            except (TypeError, ValueError):
                point = None

        source_urls = properties.get("url")
        if not isinstance(source_urls, dict):
            source_urls = {}
        severity_data = properties.get("severitydata")
        if not isinstance(severity_data, dict):
            severity_data = {}
        country = properties.get("country")
        events.append({
            "id": f"gdacs-{properties.get('eventtype', 'event')}-{properties.get('eventid', '')}",
            "source": "GDACS",
            "headline": properties.get("name") or properties.get("description") or "Regional hazard alert",
            "event": properties.get("eventtype") or "Hazard",
            "severity": severity_data.get("severitytext") or "Not specified",
            "urgency": properties.get("alertlevel") or "Unknown",
            "certainty": "Not provided",
            "description": properties.get("htmldescription") or properties.get("description") or "",
            "instruction": None,
            "areas": [country] if isinstance(country, str) and country else [],
            "coordinates": point,
            "issued_at": properties.get("datemodified"),
            "effective_at": properties.get("fromdate"),
            "expires_at": properties.get("todate"),
            "source_url": source_urls.get("report") or "https://www.gdacs.org/",
            "alert_level": properties.get("alertlevel") or "Unknown",
        })
    return events


def parse_kmd_feed(xml_content: bytes) -> tuple[datetime | None, list[dict[str, str]]]:
    root = ET.fromstring(xml_content)
    last_build = _parse_datetime(_text(root, "lastBuildDate"))
    items = []
    for item in root.iter():
        if item.tag.rsplit("}", 1)[-1] != "item":
            continue
        link = _text(item, "link")
        if not link:
            continue
        parsed = urlparse(link)
        if parsed.scheme != "https" or parsed.hostname != KMD_HOST or not parsed.path.startswith("/api/cap/"):
            continue
        items.append({
            "title": _text(item, "title") or "Weather warning",
            "link": link,
            "description": _text(item, "description") or "",
            "published_at": _text(item, "pubDate") or "",
        })
    return last_build, items


async def _fetch_gdacs(client: httpx.AsyncClient) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    fetched_at = datetime.now(timezone.utc).isoformat()
    status = {
        "source": "GDACS",
        "status": "error",
        "fetched_at": fetched_at,
        "published_at": None,
        "url": "https://www.gdacs.org/",
        "message": "Could not retrieve regional alerts.",
    }
    try:
        response = await client.get(GDACS_URL, params={"country": "Kenya", "limit": 100})
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict) or not isinstance(payload.get("features"), list):
            raise ValueError("GDACS response is not a GeoJSON feature collection")
        alerts = parse_gdacs_events(payload)
        published_dates = []
        dates = [
            _parse_datetime((feature.get("properties") or {}).get("datemodified"))
            for feature in payload.get("features", [])
            if isinstance(feature, dict)
        ]
        dates = [date for date in dates if date]
        if dates:
            published_at = max(dates)
            status["published_at"] = published_at.isoformat()
            published_dates = [published_at]
        stale = not published_dates or (
            datetime.now(timezone.utc) - published_dates[0]
        ).total_seconds() > 24 * 60 * 60
        status.update(
            status="stale" if stale else "ok",
            message=(
                "GDACS has not published an updated event in the last 24 hours."
                if stale else f"{len(alerts)} current East Africa alert(s) from the public feed."
            ),
        )
        return alerts, status
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("GDACS alert feed unavailable: %s", exc)
        status["message"] = "GDACS could not be reached or returned invalid data."
        return [], status


async def _fetch_kmd(client: httpx.AsyncClient) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    status = {
        "source": "Kenya Meteorological Department",
        "status": "error",
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "published_at": None,
        "url": "https://meteo.go.ke/weather-warnings/",
        "message": "Could not retrieve Kenya Meteorological Department warnings.",
    }
    try:
        response = await client.get(KMD_RSS_URL)
        response.raise_for_status()
        published_at, items = parse_kmd_feed(response.content)
        status["published_at"] = published_at.isoformat() if published_at else None
        cap_responses = await asyncio.gather(
            *(client.get(item["link"]) for item in items[:20]),
            return_exceptions=True,
        )
        alerts = []
        failures = 0
        for item, cap_response in zip(items[:20], cap_responses):
            if isinstance(cap_response, Exception):
                failures += 1
                continue
            try:
                cap_response.raise_for_status()
                alert = parse_kmd_alert(cap_response.content)
            except (httpx.HTTPError, ET.ParseError, ValueError):
                failures += 1
                continue
            if alert:
                if alert["headline"] == "Weather warning":
                    alert["headline"] = item["title"]
                alerts.append(alert)

        stale = published_at is None or (
            datetime.now(timezone.utc) - published_at
        ).total_seconds() > 24 * 60 * 60
        if failures:
            status.update(
                status="degraded",
                message="Some individual CAP alert records could not be loaded.",
            )
        elif stale:
            status.update(
                status="stale",
                message="The official RSS feed has not been updated in the last 24 hours.",
            )
        else:
            status.update(
                status="ok",
                message=f"{len(alerts)} active official warning(s) in the CAP feed."
                if alerts else "No active official warnings in the CAP feed.",
            )
        return alerts, status
    except (httpx.HTTPError, ET.ParseError, ValueError) as exc:
        logger.warning("Kenya Meteorological Department alert feed unavailable: %s", exc)
        status["message"] = "The official CAP feed could not be reached or parsed."
        return [], status


async def get_hazard_alerts() -> dict[str, Any]:
    global _cache
    now = time.monotonic()
    if _cache and now - _cache[0] < CACHE_SECONDS:
        return _cache[1]

    async with _cache_lock:
        now = time.monotonic()
        if _cache and now - _cache[0] < CACHE_SECONDS:
            return _cache[1]
        async with httpx.AsyncClient(timeout=12.0, follow_redirects=False) as client:
            gdacs, kmd = await asyncio.gather(_fetch_gdacs(client), _fetch_kmd(client))
        result = {
            "alerts": sorted(
                gdacs[0] + kmd[0],
                key=lambda alert: alert.get("issued_at") or "",
                reverse=True,
            ),
            "sources": [gdacs[1], kmd[1]],
            "fetched_at": datetime.now(timezone.utc).isoformat(),
        }
        _cache = (time.monotonic(), result)
        return result
