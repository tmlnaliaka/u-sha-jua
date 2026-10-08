import os
import re
import json
import logging
from typing import Dict, Any, Tuple
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
    "eldoret": (0.5143, 35.2698, "Eldoret Town Center")
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

class NLPService:
    def __init__(self):
        self.gemini_available = False
        if settings.GEMINI_API_KEY:
            try:
                import google.generativeai as genai
                genai.configure(api_key=settings.GEMINI_API_KEY)
                self.gemini_model = genai.GenerativeModel("gemini-1.5-flash")
                self.gemini_available = True
                logger.info("Gemini API client initialized successfully.")
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
        1. Tries Gemini structured inference if API key is valid.
        2. Seamlessly falls back to calibrated deterministic regex/gazetteer parser.
        3. Honors device GPS coordinates if provided.
        """
        if self.gemini_available:
            try:
                return await self._extract_with_gemini(raw_text, device_lat, device_lon)
            except Exception as e:
                logger.warning(f"Gemini API inference failed ({e}), falling back to offline spatial NLP.")

        return self._extract_fallback(raw_text, device_lat, device_lon)

    async def _extract_with_gemini(
        self,
        raw_text: str,
        device_lat: float = None,
        device_lon: float = None
    ) -> DistressExtractionResult:
        import google.generativeai as genai
        
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

        # 1. Classification
        incident_type = IncidentType.FLOOD
        if any(w in text_lower for w in ["fire", "moto", "choma", "smoke", "burning", "blaze", "explosion"]):
            incident_type = IncidentType.FIRE
        elif any(w in text_lower for w in ["collapse", "building", "debris", "trapped rubble", "cracked", "mudslide", "landslide", "anguka"]):
            incident_type = IncidentType.COLLAPSE
        elif any(w in text_lower for w in ["flood", "water", "mafuriko", "mvua", "drowning", "river overflow", "submerged", "swept"]):
            incident_type = IncidentType.FLOOD

        # 2. Urgency
        urgency = UrgencyLevel.MEDIUM
        critical_keywords = [
            "trapped", "dying", "children trapped", "unconscious", "explosion",
            "immediate help", "urgent", "emergency", "cannot breathe", "swept away",
            "people inside", "help us now", "drowning"
        ]
        low_keywords = ["water logging", "damage", "puddles", "small smoke", "minor cracks", "traffic delay"]

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
