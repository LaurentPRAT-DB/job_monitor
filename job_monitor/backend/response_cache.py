"""In-memory API response cache for fast repeated requests.

Provides TTL-based caching for expensive API responses. This complements
the Delta table cache by avoiding repeated processing of cache table results.

Usage:
    from job_monitor.backend.response_cache import response_cache

    @router.get("/expensive-endpoint")
    async def get_data():
        cache_key = "expensive_data"
        cached = response_cache.get(cache_key)
        if cached:
            return cached

        result = await expensive_operation()
        response_cache.set(cache_key, result, ttl_seconds=300)
        return result
"""

import logging
import time
from dataclasses import dataclass
from threading import Lock
from typing import Any

logger = logging.getLogger(__name__)


@dataclass
class CacheEntry:
    """Cache entry with value and expiration time."""
    value: Any
    expires_at: float
    created_at: float


class ResponseCache:
    """Thread-safe in-memory cache with TTL support.

    Features:
    - TTL-based expiration
    - Automatic cleanup of expired entries
    - Thread-safe operations
    - Memory-bounded (max entries limit)
    """

    def __init__(self, max_entries: int = 100, default_ttl: int = 300):
        """Initialize cache.

        Args:
            max_entries: Maximum number of cache entries (LRU eviction)
            default_ttl: Default TTL in seconds (5 minutes)
        """
        self._cache: dict[str, CacheEntry] = {}
        self._lock = Lock()
        self._max_entries = max_entries
        self._default_ttl = default_ttl
        self._hits = 0
        self._misses = 0

    def get(self, key: str) -> Any | None:
        """Get cached value if exists and not expired.

        Args:
            key: Cache key

        Returns:
            Cached value or None if not found/expired
        """
        with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                self._misses += 1
                return None

            if time.time() > entry.expires_at:
                # Entry expired, remove it
                del self._cache[key]
                self._misses += 1
                logger.debug(f"[RESPONSE_CACHE] EXPIRED: {key}")
                return None

            self._hits += 1
            age_ms = int((time.time() - entry.created_at) * 1000)
            logger.info(f"[RESPONSE_CACHE] HIT: {key} (age: {age_ms}ms)")
            return entry.value

    def set(self, key: str, value: Any, ttl_seconds: int | None = None) -> None:
        """Set cache value with TTL.

        Args:
            key: Cache key
            value: Value to cache
            ttl_seconds: TTL in seconds (uses default if None)
        """
        ttl = ttl_seconds if ttl_seconds is not None else self._default_ttl
        now = time.time()

        with self._lock:
            # Evict oldest entries if at capacity
            if len(self._cache) >= self._max_entries:
                self._evict_oldest()

            self._cache[key] = CacheEntry(
                value=value,
                expires_at=now + ttl,
                created_at=now,
            )
            logger.info(f"[RESPONSE_CACHE] SET: {key} (ttl: {ttl}s)")

    def invalidate(self, key: str) -> bool:
        """Remove specific entry from cache.

        Args:
            key: Cache key to invalidate

        Returns:
            True if entry was removed, False if not found
        """
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                logger.info(f"[RESPONSE_CACHE] INVALIDATE: {key}")
                return True
            return False

    def invalidate_pattern(self, prefix: str) -> int:
        """Remove all entries matching a prefix.

        Args:
            prefix: Key prefix to match

        Returns:
            Number of entries removed
        """
        with self._lock:
            keys_to_remove = [k for k in self._cache if k.startswith(prefix)]
            for key in keys_to_remove:
                del self._cache[key]
            if keys_to_remove:
                logger.info(f"[RESPONSE_CACHE] INVALIDATE_PATTERN: {prefix} ({len(keys_to_remove)} entries)")
            return len(keys_to_remove)

    def clear(self) -> None:
        """Clear all cache entries."""
        with self._lock:
            count = len(self._cache)
            self._cache.clear()
            logger.info(f"[RESPONSE_CACHE] CLEAR: removed {count} entries")

    def _evict_oldest(self) -> None:
        """Evict oldest entries to make room (must be called with lock held)."""
        if not self._cache:
            return

        # Sort by creation time and remove oldest 10%
        sorted_keys = sorted(
            self._cache.keys(),
            key=lambda k: self._cache[k].created_at
        )
        evict_count = max(1, len(sorted_keys) // 10)

        for key in sorted_keys[:evict_count]:
            del self._cache[key]

        logger.debug(f"[RESPONSE_CACHE] EVICT: removed {evict_count} oldest entries")

    def cleanup_expired(self) -> int:
        """Remove all expired entries.

        Returns:
            Number of entries removed
        """
        now = time.time()
        with self._lock:
            expired_keys = [
                k for k, v in self._cache.items()
                if now > v.expires_at
            ]
            for key in expired_keys:
                del self._cache[key]

            if expired_keys:
                logger.info(f"[RESPONSE_CACHE] CLEANUP: removed {len(expired_keys)} expired entries")
            return len(expired_keys)

    def stats(self) -> dict[str, Any]:
        """Get cache statistics.

        Returns:
            Dict with hits, misses, size, hit_rate
        """
        with self._lock:
            total = self._hits + self._misses
            hit_rate = (self._hits / total * 100) if total > 0 else 0
            return {
                "hits": self._hits,
                "misses": self._misses,
                "size": len(self._cache),
                "max_size": self._max_entries,
                "hit_rate_percent": round(hit_rate, 1),
            }


# Global response cache instance
# TTL settings per endpoint type:
# - Alerts: 2 minutes (needs some freshness)
# - Health metrics: 5 minutes (can be slightly stale)
# - Costs: 10 minutes (rarely changes quickly)
response_cache = ResponseCache(max_entries=50, default_ttl=300)


# Convenience TTL constants
TTL_LIVE = 60        # 1 minute - for running jobs, current alerts
TTL_FAST = 120       # 2 minutes - for alerts
TTL_STANDARD = 300   # 5 minutes - for health metrics
TTL_SLOW = 600       # 10 minutes - for costs, historical
