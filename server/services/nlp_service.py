import os
import re
import json
import time
import asyncio
import logging
import threading
from typing import Dict, Any, Tuple, Optional
from collections import OrderedDict
from config import settings
from models.incident import IncidentType, UrgencyLevel

logger = logging.getLogger("nlp_service")

# Kenyan & East African crisis gazetteer for offline resilience
KENYA_GAZETTEER: Dict[str, Tuple[float, float, str]] = {
    "mathare": (-1.2612, 36.8574, "Mathare Valley, Nairobi"),
    "kibera": (-1.3133, 36.7869, "Kibera, Nairobi"),
    "mukuru": (-1.3197, 36.8770, "Mukuru kwa Njenga, Nairobi"),
    "gikomba": (-1.2850, 36.8375, "Gikomba Market, Nairobi"),
    "eastleigh": (-1.2764, 36.8524, "Eastleigh Section 3, Nairobi"),
    "dandora": (-1.2514, 36.8973, "Dandora Phase 4, Nairobi"),
    "kawangware": (-1.2891, 36.7456, "Kawangware, Nairobi"),
    "pipeline": (-1.3150, 36.8994, "Pipeline Estate, Embakasi, Nairobi"),
    "tassia": (-1.3142, 36.9083, "Tassia Fedha, Nairobi"),
    "south c": (-1.3189, 36.8300, "South C, Nairobi River Basin"),
    "westlands": (-1.2676, 36.8078, "Westlands, Nairobi"),
    "kasarani": (-1.2256, 36.8981, "Kasarani, Nairobi"),
    "budalangi": (0.1342, 34.0203, "Budalangi Flood Basin, Busia"),
    "nyalenda": (-0.1219, 34.7645, "Nyalenda, Kisumu"),
    "obunga": (-0.0864, 34.7431, "Obunga, Kisumu"),
    "manyatta": (-0.0989, 34.7761, "Manyatta, Kisumu"),
    "old town": (-4.0574, 39.6738, "Old Town, Mombasa"),
    "likoni": (-4.0811, 39.6644, "Likoni Ferry Channel, Mombasa"),
    "bamburi": (-4.0044, 39.7153, "Bamburi, Mombasa"),
    "garissa": (-0.4532, 39.6460, "Tana River Basin, Garissa"),
    "nakuru": (-0.3031, 36.0800, "Nakuru Lake Basin"),
    "eldoret": (0.5143, 35.2698, "Eldoret Town Center"),
    "korogocho": (-1.2469, 36.8897, "Korogocho, Nairobi"),
    "huruma": (-1.2569, 36.8711, "Huruma Estate, Nairobi")
}

DEFAULT_COORDINATES = (-1.286389, 36.817223, "Nairobi Central, Kenya")

class DistressExtractionResult:
    def __init__(
        self,
        incident_type: IncidentType,
        urgency_level: UrgencyLevel,
        location_name: str,
        latitude: float,
        longitude: float,
        confidence_score: float
    ):
        self.incident_type = incident_type
        self.urgency_level = urgency_level
        self.location_name = location_name
        self.latitude = latitude
        self.longitude = longitude
        self.confidence_score = confidence_score

    def to_dict(self) -> Dict[str, Any]:
        return {
            "incident_type": self.incident_type.value,
            "urgency_level": self.urgency_level.value,
            "location_name": self.location_name,
            "coordinates": {
                "latitude": self.latitude,
                "longitude": self.longitude
            },
            "confidence_score": self.confidence_score
        }

class NLPExtractionCache:
    """Thread-safe LRU cache for normalized distress message inferences."""
    def __init__(self, maxsize: int = 2048):
        self.maxsize = maxsize
        self._cache: OrderedDict[str, DistressExtractionResult] = OrderedDict()
        self._lock = threading.RLock()
        self.hits = 0
        self.misses = 0

    def _normalize_key(self, text: str, lat: Optional[float], lon: Optional[float]) -> str:
        # Strip extraneous whitespace, numbers prefixes (like [1] test), and lowercase
        clean = re.sub(r"\[\d+\]", "", text.strip().lower())
        clean = re.sub(r"\s+", " ", clean).strip()
        lat_str = f"{lat:.4f}" if lat is not None else "none"
        lon_str = f"{lon:.4f}" if lon is not None else "none"
        return f"{clean}|{lat_str}|{lon_str}"

    def get(self, text: str, lat: Optional[float], lon: Optional[float]) -> Optional[DistressExtractionResult]:
        key = self._normalize_key(text, lat, lon)
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
                self.hits += 1
                return self._cache[key]
            self.misses += 1
            return None

    def set(self, text: str, lat: Optional[float], lon: Optional[float], result: DistressExtractionResult) -> None:
        key = self._normalize_key(text, lat, lon)
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
            self._cache[key] = result
            if len(self._cache) > self.maxsize:
                self._cache.popitem(last=False)

class NLPService:
    def __init__(self):
        self.cache = NLPExtractionCache(maxsize=4096)
        self.gemini_available = False
        self._consecutive_failures = 0
        self._circuit_open_until = 0.0

        if settings.GEMINI_API_KEY:
            try:
                import warnings
                with warnings.catch_warnings():
                    warnings.simplefilter("ignore", category=FutureWarning)
                    import google.generativeai as genai
                genai.configure(api_key=settings.GEMINI_API_KEY)
                self.gemini_model = genai.GenerativeModel("gemini-2.5-flash")
                self.gemini_available = True
                logger.info("Gemini API client initialized successfully with gemini-2.5-flash.")
            except Exception as e:
                logger.warning(f"Could not initialize Gemini API: {e}. Falling back to resilient local NLP engine.")


    async def extract_distress_report(
        self,
        raw_text: str,
        device_lat: float = None,
        device_lon: float = None
    ) -> DistressExtractionResult:
        """
        Parses civilian distress report:
        1. Fast-path: Checks in-memory LRU cache (<0.05ms).
        2. Tries Gemini structured inference with 2.0s timeout & circuit-breaker protection.
        3. Seamlessly falls back to calibrated deterministic regex/gazetteer parser.
        4. Honors device GPS coordinates if provided.
        """
        # Step 1: Check in-memory cache
        cached = self.cache.get(raw_text, device_lat, device_lon)
        if cached:
            return cached

        # Step 2: Try Gemini if available and circuit is closed
        now = time.time()
        if self.gemini_available and now > self._circuit_open_until:
            try:
                # 2.0s bounded timeout to prevent hanging civilian ingestion
                result = await asyncio.wait_for(
                    self._extract_with_gemini(raw_text, device_lat, device_lon),
                    timeout=2.0
                )
                self._consecutive_failures = 0
                self.cache.set(raw_text, device_lat, device_lon, result)
                return result
            except Exception as e:
                err_str = str(e)
                if "429" in err_str or "Quota exceeded" in err_str:
                    # Immediate quota backoff for 60s
                    self._circuit_open_until = now + 60.0
                    logger.info("Gemini API rate limit reached (429); engaging Kenya gazetteer fallback for 60s.")
                else:
                    self._consecutive_failures += 1
                    if self._consecutive_failures >= 3:
                        self._circuit_open_until = now + 30.0
                        logger.warning(f"Gemini API circuit tripped; disabling for 30s.")

        # Step 3: Local deterministic gazetteer & keyword NLP parser
        result = self._extract_fallback(raw_text, device_lat, device_lon)
        self.cache.set(raw_text, device_lat, device_lon, result)
        return result

    async def _extract_with_gemini(
        self,
        raw_text: str,
        device_lat: float = None,
        device_lon: float = None
    ) -> DistressExtractionResult:
        prompt = f"""
        You are a disaster response AI agent analyzing incoming distress messages for the u-SHA-jua platform in Kenya/East Africa.
        Analyze the following raw message and return a pure JSON object (no markdown, no backticks):
        {{
            "incident_type": "Flood" | "Fire" | "Collapse",
            "urgency_level": "Low" | "Medium" | "Critical",
            "location_name": "Specific landmark or neighbourhood",
            "estimated_lat": float,
            "estimated_lon": float,
            "confidence": float
        }}

        Distress Message: "{raw_text}"
        """
        
        response = await self.gemini_model.generate_content_async(prompt)
        text = response.text.strip()
        # Clean potential markdown formatting
        text = re.sub(r"^```json\s*", "", text)
        text = re.sub(r"^```\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
        
        data = json.loads(text)
        
        inc_type = IncidentType(data.get("incident_type", "Flood"))
        urgency = UrgencyLevel(data.get("urgency_level", "Medium"))
        loc_name = data.get("location_name", "Unknown Area")
        
        lat = device_lat if device_lat is not None else float(data.get("estimated_lat", DEFAULT_COORDINATES[0]))
        lon = device_lon if device_lon is not None else float(data.get("estimated_lon", DEFAULT_COORDINATES[1]))
        conf = float(data.get("confidence", 0.9))

        return DistressExtractionResult(
            incident_type=inc_type,
            urgency_level=urgency,
            location_name=loc_name,
            latitude=lat,
            longitude=lon,
            confidence_score=conf
        )

    def _extract_fallback(
        self,
        raw_text: str,
        device_lat: float = None,
        device_lon: float = None
    ) -> DistressExtractionResult:
        text_lower = raw_text.lower()

        # 1. Classification (English, Swahili, Sheng, and Crisis Emojis)
        incident_type = IncidentType.FLOOD
        fire_keywords = [
            "fire", "moto", "choma", "smoke", "burning", "blaze", "explosion",
            "ungua", "moshi", "mlipuko", "kuchomeka", "jivu", "🔥", "💥", "🚒"
        ]
        collapse_keywords = [
            "collapse", "building", "debris", "trapped rubble", "cracked",
            "mudslide", "landslide", "anguka", "poromoka", "kuporomoka",
            "ukuta", "ghorofa", "kifusi", "maporomoko", "bomoka", "🏚️"
        ]
        flood_keywords = [
            "flood", "water", "mafuriko", "mvua", "drowning", "river overflow",
            "submerged", "swept", "maji", "mto", "zama", "kufurika",
            "imezama", "maji yameingia", "maji mengi", "🌊", "⛈️", "🚣"
        ]

        if any(w in text_lower for w in fire_keywords):
            incident_type = IncidentType.FIRE
        elif any(w in text_lower for w in collapse_keywords):
            incident_type = IncidentType.COLLAPSE
        elif any(w in text_lower for w in flood_keywords):
            incident_type = IncidentType.FLOOD

        # 2. Urgency Level (English, Swahili, and Urgent Emojis)
        urgency = UrgencyLevel.MEDIUM
        critical_keywords = [
            "trapped", "dying", "children trapped", "unconscious", "explosion",
            "immediate help", "urgent", "emergency", "cannot breathe", "swept away",
            "people inside", "help us now", "drowning", "flash flood", "surge", "burst",
            "haraka", "watu wamekwama", "tusaidie", "okoa", "kufa", "damu", "watoto",
            "dharura", "hatari", "mauti", "kukata roho", "hali mbaya", "🚨", "🆘", "‼️"
        ]
        low_keywords = [
            "water logging", "damage", "puddles", "small smoke", "minor cracks",
            "traffic delay", "kidogo", "polepole", "uharibifu mdogo", "maji machache", "kawaida"
        ]


        if any(w in text_lower for w in critical_keywords):
            urgency = UrgencyLevel.CRITICAL
        elif any(w in text_lower for w in low_keywords):
            urgency = UrgencyLevel.LOW

        # 3. Location extraction & geocoding
        found_landmark = None
        lat = DEFAULT_COORDINATES[0]
        lon = DEFAULT_COORDINATES[1]
        loc_name = DEFAULT_COORDINATES[2]

        for key, (g_lat, g_lon, g_name) in KENYA_GAZETTEER.items():
            if key in text_lower:
                found_landmark = key
                lat = g_lat
                lon = g_lon
                loc_name = g_name
                break

        # If device GPS provided, honor device coordinates
        if device_lat is not None and device_lon is not None:
            lat = device_lat
            lon = device_lon
            if not found_landmark:
                loc_name = f"GPS Pin ({lat:.4f}, {lon:.4f})"

        return DistressExtractionResult(
            incident_type=incident_type,
            urgency_level=urgency,
            location_name=loc_name,
            latitude=lat,
            longitude=lon,
            confidence_score=0.92 if found_landmark else 0.75
        )

nlp_service = NLPService()
