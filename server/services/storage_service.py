import os
import shutil
import uuid
import logging
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Dict, Any, BinaryIO, Optional
from config import settings

logger = logging.getLogger("ushajua.storage")


class StorageProvider(ABC):
    """Abstract cloud/local storage interface for civilian disaster media attachments (Sprint 5)."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        pass

    @abstractmethod
    def save_file(
        self,
        incident_id: str,
        filename: str,
        file_obj: BinaryIO,
        content_type: str = "application/octet-stream"
    ) -> Dict[str, Any]:
        """Saves file stream and returns attachment metadata dict."""
        pass

    @abstractmethod
    def get_file_url(self, incident_id: str, filename: str) -> str:
        """Returns public or presigned URL for retrieving the attachment."""
        pass

    @abstractmethod
    def delete_incident_files(self, incident_id: str) -> int:
        """Deletes all stored files associated with an incident ID."""
        pass


class LocalStorageProvider(StorageProvider):
    """Stores multimedia evidence on local filesystem under `server/uploads/{incident_id}/`."""

    def __init__(self, base_dir: Optional[str] = None):
        self.base_dir = base_dir or os.path.join(
            os.path.dirname(os.path.dirname(__file__)), "uploads"
        )
        os.makedirs(self.base_dir, exist_ok=True)

    @property
    def provider_name(self) -> str:
        return "local"

    def _sanitize_filename(self, filename: str) -> str:
        safe = os.path.basename(filename) if filename else ""
        safe = safe.replace("..", "").strip()
        if not safe:
            safe = f"attachment_{uuid.uuid4().hex[:8]}"
        return safe

    def save_file(
        self,
        incident_id: str,
        filename: str,
        file_obj: BinaryIO,
        content_type: str = "application/octet-stream"
    ) -> Dict[str, Any]:
        safe_name = self._sanitize_filename(filename)
        inc_dir = os.path.join(self.base_dir, incident_id)
        os.makedirs(inc_dir, exist_ok=True)
        dest_path = os.path.join(inc_dir, safe_name)

        file_obj.seek(0)
        with open(dest_path, "wb") as buffer:
            shutil.copyfileobj(file_obj, buffer)

        size_bytes = os.path.getsize(dest_path)
        return {
            "filename": safe_name,
            "url": self.get_file_url(incident_id, safe_name),
            "content_type": content_type or "application/octet-stream",
            "size_bytes": size_bytes,
            "storage_backend": self.provider_name,
            "uploaded_at": datetime.now(timezone.utc).isoformat()
        }

    def get_file_url(self, incident_id: str, filename: str) -> str:
        safe_name = self._sanitize_filename(filename)
        return f"/uploads/{incident_id}/{safe_name}"

    def delete_incident_files(self, incident_id: str) -> int:
        inc_dir = os.path.join(self.base_dir, incident_id)
        if not os.path.exists(inc_dir):
            return 0
        try:
            count = len(os.listdir(inc_dir))
            shutil.rmtree(inc_dir, ignore_errors=True)
            return count
        except Exception:
            return 0


class S3StorageProvider(StorageProvider):
    """
    S3 / MinIO / GCS-compatible object storage provider for container-resilient disaster media.
    If boto3 or S3 credentials are unreachable in offline environments, degrades gracefully to local mirror
    while formatting S3 object keys.
    """

    def __init__(
        self,
        bucket: Optional[str] = None,
        endpoint_url: Optional[str] = None,
        region: Optional[str] = None,
        local_fallback_dir: Optional[str] = None
    ):
        self.bucket = bucket or getattr(settings, "AWS_S3_BUCKET", "ushajua-disaster-media")
        self.endpoint_url = endpoint_url if endpoint_url is not None else getattr(settings, "AWS_S3_ENDPOINT_URL", "")
        self.region = region or getattr(settings, "AWS_S3_REGION", "af-south-1")
        self._local_mirror = LocalStorageProvider(base_dir=local_fallback_dir)
        self._s3_client = None
        self._init_s3_client()

    def _init_s3_client(self) -> None:
        access_key = getattr(settings, "AWS_ACCESS_KEY_ID", "")
        secret_key = getattr(settings, "AWS_SECRET_ACCESS_KEY", "")
        if not access_key or not secret_key:
            return
        try:
            import boto3  # type: ignore
            kwargs: Dict[str, Any] = {
                "aws_access_key_id": access_key,
                "aws_secret_access_key": secret_key,
                "region_name": self.region
            }
            if self.endpoint_url:
                kwargs["endpoint_url"] = self.endpoint_url
            self._s3_client = boto3.client("s3", **kwargs)
        except Exception as exc:
            logger.warning("boto3 S3 client initialization skipped (%s); using local mirror.", exc)
            self._s3_client = None

    @property
    def provider_name(self) -> str:
        return "s3"

    def _object_key(self, incident_id: str, filename: str) -> str:
        safe_name = os.path.basename(filename) if filename else f"attachment_{uuid.uuid4().hex[:8]}"
        return f"incidents/{incident_id}/{safe_name}"

    def save_file(
        self,
        incident_id: str,
        filename: str,
        file_obj: BinaryIO,
        content_type: str = "application/octet-stream"
    ) -> Dict[str, Any]:
        safe_name = os.path.basename(filename) if filename else f"attachment_{uuid.uuid4().hex[:8]}"
        key = self._object_key(incident_id, safe_name)

        file_obj.seek(0)
        raw_bytes = file_obj.read()
        size_bytes = len(raw_bytes)

        uploaded_to_s3 = False
        if self._s3_client is not None:
            try:
                self._s3_client.put_object(
                    Bucket=self.bucket,
                    Key=key,
                    Body=raw_bytes,
                    ContentType=content_type or "application/octet-stream"
                )
                uploaded_to_s3 = True
            except Exception as exc:
                logger.warning("S3 put_object failed (%s); mirroring locally.", exc)

        # Always keep local mirror if S3 upload was not live so static /uploads routes work in hybrid mode
        if not uploaded_to_s3:
            import io
            self._local_mirror.save_file(incident_id, safe_name, io.BytesIO(raw_bytes), content_type)

        return {
            "filename": safe_name,
            "object_key": key,
            "url": self.get_file_url(incident_id, safe_name),
            "content_type": content_type or "application/octet-stream",
            "size_bytes": size_bytes,
            "storage_backend": self.provider_name,
            "uploaded_at": datetime.now(timezone.utc).isoformat()
        }

    def get_file_url(self, incident_id: str, filename: str) -> str:
        key = self._object_key(incident_id, filename)
        if self._s3_client is not None:
            if self.endpoint_url:
                return f"{self.endpoint_url.rstrip('/')}/{self.bucket}/{key}"
            return f"https://{self.bucket}.s3.{self.region}.amazonaws.com/{key}"
        return f"/uploads/{incident_id}/{os.path.basename(filename)}"

    def delete_incident_files(self, incident_id: str) -> int:
        deleted = self._local_mirror.delete_incident_files(incident_id)
        if self._s3_client is not None:
            try:
                prefix = f"incidents/{incident_id}/"
                resp = self._s3_client.list_objects_v2(Bucket=self.bucket, Prefix=prefix)
                contents = resp.get("Contents", [])
                for obj in contents:
                    self._s3_client.delete_object(Bucket=self.bucket, Key=obj["Key"])
                    deleted += 1
            except Exception:
                pass
        return deleted


def get_storage_provider(backend: Optional[str] = None) -> StorageProvider:
    mode = (backend or getattr(settings, "STORAGE_BACKEND", "local")).lower().strip()
    if mode == "s3":
        return S3StorageProvider()
    return LocalStorageProvider()


storage_service: StorageProvider = get_storage_provider()

