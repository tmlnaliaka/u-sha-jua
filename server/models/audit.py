from sqlalchemy import Column, Integer, String, Text
from database import Base


class AuditBlock(Base):
    """
    Durable relational storage for the SHA-256 Tamper-Evident Cryptographic Audit Ledger.
    Why: Storing hash-chained blocks solely in RAM loses accountability on container restart.
    Persisting each block guarantees post-disaster non-repudiation across restarts.
    """
    __tablename__ = "audit_blocks"

    entry_id = Column(Integer, primary_key=True, index=True, autoincrement=False)
    timestamp = Column(String(64), nullable=False)
    action = Column(String(128), nullable=False, index=True)
    actor = Column(String(128), nullable=False)
    details_json = Column(Text, nullable=False)
    previous_hash = Column(String(64), nullable=False)
    entry_hash = Column(String(64), nullable=False, unique=True, index=True)

