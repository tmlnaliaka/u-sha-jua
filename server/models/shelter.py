import uuid
from sqlalchemy import Column, String, Float, Integer, Boolean
from database import Base

class Shelter(Base):
    __tablename__ = "evacuation_shelters"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(128), nullable=False)
    location_name = Column(String(128), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    capacity_total = Column(Integer, nullable=False, default=500)
    occupancy_current = Column(Integer, nullable=False, default=0)
    water_supply_status = Column(String(32), nullable=False, default="Operational")
    medical_post_available = Column(Boolean, nullable=False, default=True)
    contact_phone = Column(String(32), nullable=False, default="+254 700 000 000")
    is_active = Column(Boolean, nullable=False, default=True)

    def to_dict(self):
        available = max(0, self.capacity_total - self.occupancy_current)
        occupancy_pct = round((self.occupancy_current / self.capacity_total) * 100, 1) if self.capacity_total > 0 else 100.0
        return {
            "id": self.id,
            "name": self.name,
            "location_name": self.location_name,
            "coordinates": {
                "latitude": self.latitude,
                "longitude": self.longitude
            },
            "capacity_total": self.capacity_total,
            "occupancy_current": self.occupancy_current,
            "available_space": available,
            "occupancy_percent": occupancy_pct,
            "water_supply_status": self.water_supply_status,
            "medical_post_available": self.medical_post_available,
            "contact_phone": self.contact_phone,
            "is_active": self.is_active
        }
