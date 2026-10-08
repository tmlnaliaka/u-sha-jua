import os
import uuid
from pathlib import Path
from typing import Tuple

from fastapi import HTTPException, UploadFile

from config import settings

MAX_EVIDENCE_BYTES = 20 * 1024 * 1024
ALLOWED_MEDIA_TYPES = {"image/jpeg", "image/png", "image/webp", "video/mp4", "video/quicktime"}


async def read_evidence(file: UploadFile) -> Tuple[str, str, bytes]:
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_MEDIA_TYPES:
        raise HTTPException(status_code=415, detail="Evidence must be a JPEG, PNG, WebP, MP4, or QuickTime file.")

    content = await file.read(MAX_EVIDENCE_BYTES + 1)
    if not content or len(content) > MAX_EVIDENCE_BYTES:
        raise HTTPException(status_code=413, detail="Each evidence file must be between 1 byte and 20 MB.")

    valid_signature = (
        (content_type == "image/jpeg" and content.startswith(b"\xff\xd8\xff"))
        or (content_type == "image/png" and content.startswith(b"\x89PNG\r\n\x1a\n"))
        or (content_type == "image/webp" and content.startswith(b"RIFF") and content[8:12] == b"WEBP")
        or (content_type in {"video/mp4", "video/quicktime"} and content[4:8] == b"ftyp")
    )
    if not valid_signature:
        raise HTTPException(status_code=415, detail="The uploaded file content does not match its declared media type.")

    filename = Path((file.filename or "evidence").replace("\\", "/")).name[:255]
    extension = Path(filename).suffix.lower()
    if not extension:
        extension = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
            "video/mp4": ".mp4",
            "video/quicktime": ".mov",
        }[content_type]
    return filename, content_type, content


def persist_evidence(content: bytes, extension: str) -> str:
    storage_key = f"{uuid.uuid4().hex}{extension}"
    directory = Path(settings.EVIDENCE_DIRECTORY).resolve()
    directory.mkdir(parents=True, exist_ok=True)
    (directory / storage_key).write_bytes(content)
    return storage_key


def evidence_path(storage_key: str) -> Path:
    directory = Path(settings.EVIDENCE_DIRECTORY).resolve()
    path = (directory / storage_key).resolve()
    if path.parent != directory:
        raise ValueError("Invalid evidence storage key")
    return path


def remove_evidence(storage_key: str) -> None:
    path = evidence_path(storage_key)
    if path.is_file():
        os.remove(path)
