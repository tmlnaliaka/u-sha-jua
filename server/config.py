import os
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

class Settings(BaseModel):
    PROJECT_NAME: str = "u-SHA-jua Disaster Informatics Platform"
    API_V1_PREFIX: str = "/api/v1"
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./ushajua.db")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    AFRICASTALKING_API_KEY: str = os.getenv("AFRICASTALKING_API_KEY", "")
    AFRICASTALKING_USERNAME: str = os.getenv("AFRICASTALKING_USERNAME", "sandbox")
    AFRICASTALKING_SENDER_ID: str = os.getenv("AFRICASTALKING_SENDER_ID", "uSHAjua")
    MAPBOX_ACCESS_TOKEN: str = os.getenv("MAPBOX_ACCESS_TOKEN", "")
    HOST: str = os.getenv("HOST", "127.0.0.1")
    PORT: int = int(os.getenv("PORT", "8000"))
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    ENFORCE_STRICT_AUTH: bool = os.getenv("ENFORCE_STRICT_AUTH", "false").lower() in ("true", "1")
    DISPATCHER_API_KEY: str = os.getenv("DISPATCHER_API_KEY", "ushajua-dev-dispatcher-key")
    RESPONDER_API_KEY: str = os.getenv("RESPONDER_API_KEY", "ushajua-dev-responder-key")
    ADMIN_API_KEY: str = os.getenv("ADMIN_API_KEY", "ushajua-dev-admin-key")
    SMS_WEBHOOK_SECRET: str = os.getenv("SMS_WEBHOOK_SECRET", "")
    REDIS_URL: str = os.getenv("REDIS_URL", "")
    STORAGE_BACKEND: str = os.getenv("STORAGE_BACKEND", "local")
    AWS_S3_BUCKET: str = os.getenv("AWS_S3_BUCKET", "ushajua-disaster-media")
    AWS_S3_ENDPOINT_URL: str = os.getenv("AWS_S3_ENDPOINT_URL", "")
    AWS_ACCESS_KEY_ID: str = os.getenv("AWS_ACCESS_KEY_ID", "")
    AWS_SECRET_ACCESS_KEY: str = os.getenv("AWS_SECRET_ACCESS_KEY", "")
    AWS_S3_REGION: str = os.getenv("AWS_S3_REGION", "af-south-1")
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ]

settings = Settings()
