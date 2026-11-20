import time
import threading
import logging
from typing import Optional, Dict, Any, Tuple
from config import settings

logger = logging.getLogger("ushajua.cache")


class HybridCacheAdapter:
    """
    Multi-worker shared state adapter (Sprint 2).
    Connects to Redis if `REDIS_URL` is configured and reachable; otherwise falls back
    transparently to a thread-safe in-memory store with TTL and sorted-set sliding window support.
    """

    def __init__(self, redis_url: Optional[str] = None):
        self.redis_url = redis_url if redis_url is not None else getattr(settings, "REDIS_URL", "")
        self._redis = None
        self._lock = threading.RLock()
        self._kv: Dict[str, Tuple[Any, Optional[float]]] = {}
        self._zsets: Dict[str, Dict[str, float]] = {}
        self._hashes: Dict[str, Dict[str, int]] = {}
        self._connect_redis()

    def _connect_redis(self) -> None:
        if not self.redis_url:
            return
        try:
            import redis  # type: ignore
            client = redis.from_url(self.redis_url, decode_responses=True, socket_connect_timeout=1.5)
            client.ping()
            self._redis = client
            logger.info("Connected to Redis shared state store at %s", self.redis_url)
        except Exception as exc:
            self._redis = None
            logger.warning("Redis unavailable (%s); falling back to thread-safe in-memory adapter.", exc)

    @property
    def backend_mode(self) -> str:
        return "redis" if self._redis is not None else "in_memory"

    # --- Key-Value with TTL (used by JWT token revocation & idempotency) ---

    def set(self, key: str, value: str, ttl_seconds: Optional[float] = None) -> None:
        if self._redis is not None:
            try:
                if ttl_seconds and ttl_seconds > 0:
                    self._redis.setex(key, max(1, int(ttl_seconds)), value)
                else:
                    self._redis.set(key, value)
                return
            except Exception:
                pass

        with self._lock:
            exp = (time.time() + ttl_seconds) if (ttl_seconds and ttl_seconds > 0) else None
            self._kv[key] = (value, exp)

    def get(self, key: str) -> Optional[str]:
        if self._redis is not None:
            try:
                return self._redis.get(key)
            except Exception:
                pass

        with self._lock:
            entry = self._kv.get(key)
            if not entry:
                return None
            val, exp = entry
            if exp is not None and exp < time.time():
                del self._kv[key]
                return None
            return val

    def exists(self, key: str) -> bool:
        if self._redis is not None:
            try:
                return bool(self._redis.exists(key))
            except Exception:
                pass

        return self.get(key) is not None

    def delete(self, key: str) -> None:
        if self._redis is not None:
            try:
                self._redis.delete(key)
                return
            except Exception:
                pass

        with self._lock:
            self._kv.pop(key, None)

    def purge_expired_kv(self) -> int:
        """Purges expired keys from the in-memory fallback dictionary and returns count removed."""
        now = time.time()
        removed = 0
        with self._lock:
            expired = [k for k, (_, exp) in self._kv.items() if exp is not None and exp < now]
            for k in expired:
                del self._kv[k]
                removed += 1
        return removed

    # --- Sorted Set Sliding Window (used by RateLimiter) ---

    def sliding_window_allow(
        self,
        bucket_key: str,
        max_requests: int,
        window_seconds: float
    ) -> Tuple[bool, int, float]:
        """
        Evaluates sliding-window rate limit using Redis ZSET (ZREMRANGEBYSCORE + ZCARD + ZADD)
        or thread-safe in-memory sorted timestamps.
        Returns (allowed, remaining, retry_after_seconds).
        """
        now = time.time()
        cutoff = now - window_seconds

        if self._redis is not None:
            try:
                zkey = f"rl:{bucket_key}"
                pipe = self._redis.pipeline()
                pipe.zremrangebyscore(zkey, "-inf", cutoff)
                pipe.zrange(zkey, 0, -1, withscores=True)
                _, current_members = pipe.execute()
                count = len(current_members)
                if count >= max_requests:
                    oldest_ts = float(current_members[0][1]) if current_members else now
                    retry_after = round(window_seconds - (now - oldest_ts), 1)
                    return False, 0, max(1.0, retry_after)

                member = f"{now:.6f}:{threading.get_ident()}"
                pipe2 = self._redis.pipeline()
                pipe2.zadd(zkey, {member: now})
                pipe2.expire(zkey, max(1, int(window_seconds) + 5))
                pipe2.execute()
                remaining = max(0, max_requests - count - 1)
                return True, remaining, 0.0
            except Exception:
                pass

        with self._lock:
            zset = self._zsets.setdefault(bucket_key, {})
            # Purge older than cutoff
            stale = [m for m, score in zset.items() if score <= cutoff]
            for m in stale:
                del zset[m]

            scores = sorted(zset.values())
            count = len(scores)
            if count >= max_requests:
                retry_after = round(window_seconds - (now - scores[0]), 1)
                return False, 0, max(1.0, retry_after)

            member = f"{now:.6f}:{len(zset)}"
            zset[member] = now
            remaining = max(0, max_requests - count - 1)
            return True, remaining, 0.0

    def reset_sliding_window(self, bucket_key: Optional[str] = None) -> None:
        if self._redis is not None:
            try:
                if bucket_key:
                    self._redis.delete(f"rl:{bucket_key}")
                else:
                    for k in self._redis.scan_iter("rl:*"):
                        self._redis.delete(k)
            except Exception:
                pass

        with self._lock:
            if bucket_key:
                self._zsets.pop(bucket_key, None)
            else:
                self._zsets.clear()

    # --- Shared Hash Counters (used by TelemetryCollector across workers) ---

    def hincrby(self, hash_key: str, field: str, amount: int = 1) -> int:
        if self._redis is not None:
            try:
                return int(self._redis.hincrby(hash_key, field, amount))
            except Exception:
                pass

        with self._lock:
            h = self._hashes.setdefault(hash_key, {})
            h[field] = h.get(field, 0) + amount
            return h[field]

    def hgetall(self, hash_key: str) -> Dict[str, int]:
        if self._redis is not None:
            try:
                raw = self._redis.hgetall(hash_key)
                return {k: int(v) for k, v in raw.items()}
            except Exception:
                pass

        with self._lock:
            return dict(self._hashes.get(hash_key, {}))


cache_service = HybridCacheAdapter()

