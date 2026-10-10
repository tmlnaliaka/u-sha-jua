import os
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseModel):
    PROJECT_NAME: str = "u-SHA-jua Disaster Informatics Platform"
    API_V1_PREFIX: str = "/api/v1"
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./ushajua.db")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GOOGLE_MAPS_API_KEY: str = os.getenv("GOOGLE_MAPS_API_KEY", "")
    AFRICASTALKING_API_KEY: str = os.getenv("AFRICASTALKING_API_KEY", "")
    AFRICASTALKING_USERNAME: str = os.getenv("AFRICASTALKING_USERNAME", "")
    AFRICASTALKING_SENDER_ID: str = os.getenv("AFRICASTALKING_SENDER_ID", "")
    AFRICASTALKING_WEBHOOK_TOKEN: str = os.getenv("AFRICASTALKING_WEBHOOK_TOKEN", "")
    EVIDENCE_DIRECTORY: str = os.getenv("EVIDENCE_DIRECTORY", os.path.join(os.path.dirname(__file__), "evidence"))
    AUTH_SECRET_KEY: str = os.getenv("AUTH_SECRET_KEY", "")
    AUTH_ACCESS_TOKEN_MINUTES: int = int(os.getenv("AUTH_ACCESS_TOKEN_MINUTES", "60"))
    ADMIN_EMAIL: str = os.getenv("ADMIN_EMAIL", "")
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "")
    ADMIN_NAME: str = os.getenv("ADMIN_NAME", "Emergency Operations Administrator")
    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", "8000"))
    CORS_ORIGINS: list[str] = os.getenv("CORS_ORIGINS", ",".join([
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ])).split(",")

settings = Settings()
