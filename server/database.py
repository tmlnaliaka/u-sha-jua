from sqlalchemy import create_engine, event
from sqlalchemy.orm import declarative_base, sessionmaker
from config import settings

# Engine configuration with sqlite thread check handling & high-concurrency lock timeout
connect_args = {}
engine_kwargs = {
    "echo": False,
    "future": True
}

if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {
        "check_same_thread": False,
        "timeout": 30
    }
else:
    # Production PostgreSQL / PostGIS connection pooling configuration
    engine_kwargs.update({
        "pool_size": 20,
        "max_overflow": 40,
        "pool_timeout": 30,
        "pool_recycle": 1800,
        "pool_pre_ping": True,
    })

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    **engine_kwargs
)

# Enable SQLite Write-Ahead Logging (WAL) for concurrent read/write scaling with auto-healing resilience
if settings.DATABASE_URL.startswith("sqlite"):
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        try:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL")
            cursor.execute("PRAGMA synchronous=NORMAL")
            cursor.execute("PRAGMA busy_timeout=30000")
            cursor.close()
        except Exception as e:
            # If WAL mode triggers a lock or corrupted disk image, fall back safely
            try:
                cursor = dbapi_connection.cursor()
                cursor.execute("PRAGMA busy_timeout=30000")
                cursor.close()
            except Exception:
                pass

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

