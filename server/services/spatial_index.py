import math
import time
import threading
from typing import Dict, List, Tuple, Optional, Any, Set
from collections import OrderedDict

class SpatialLRUCache:
    """
    Thread-safe Geospatial LRU Viewport Cache with time-to-live (TTL).
    Caches GeoJSON FeatureCollections for quantized bounding boxes.
    """
    def __init__(self, maxsize: int = 2048, default_ttl_sec: float = 30.0):
        self.maxsize = maxsize
        self.default_ttl = default_ttl_sec
        self._cache: OrderedDict[str, Tuple[float, Any]] = OrderedDict()
        self._lock = threading.RLock()
        self.hits = 0
        self.misses = 0

    def _quantize_key(
        self,
        min_lat: Optional[float],
        max_lat: Optional[float],
        min_lon: Optional[float],
        max_lon: Optional[float],
        status_filter: Optional[str],
        limit: int
    ) -> str:
        # Quantize coordinates to 0.01 degrees (~1.1 km) to cluster adjacent viewport requests
        q_min_lat = f"{min_lat:.2f}" if min_lat is not None else "none"
        q_max_lat = f"{max_lat:.2f}" if max_lat is not None else "none"
        q_min_lon = f"{min_lon:.2f}" if min_lon is not None else "none"
        q_max_lon = f"{max_lon:.2f}" if max_lon is not None else "none"
        return f"{q_min_lat}:{q_max_lat}:{q_min_lon}:{q_max_lon}:{status_filter or 'all'}:{limit}"

    def get(
        self,
        min_lat: Optional[float],
        max_lat: Optional[float],
        min_lon: Optional[float],
        max_lon: Optional[float],
        status_filter: Optional[str],
        limit: int
    ) -> Optional[Any]:
        key = self._quantize_key(min_lat, max_lat, min_lon, max_lon, status_filter, limit)
        now = time.time()
        with self._lock:
            if key in self._cache:
                expires_at, value = self._cache[key]
                if now < expires_at:
                    self._cache.move_to_end(key)
                    self.hits += 1
                    return value
                else:
                    del self._cache[key]
            self.misses += 1
            return None

    def set(
        self,
        min_lat: Optional[float],
        max_lat: Optional[float],
        min_lon: Optional[float],
        max_lon: Optional[float],
        status_filter: Optional[str],
        limit: int,
        value: Any,
        ttl_sec: Optional[float] = None
    ) -> None:
        key = self._quantize_key(min_lat, max_lat, min_lon, max_lon, status_filter, limit)
        expires_at = time.time() + (ttl_sec or self.default_ttl)
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
            self._cache[key] = (expires_at, value)
            if len(self._cache) > self.maxsize:
                self._cache.popitem(last=False)

    def invalidate_all(self) -> None:
        """Evicts all cached viewports when a mutation (create/update/delete) occurs."""
        with self._lock:
            self._cache.clear()

    @property
    def hit_rate(self) -> float:
        total = self.hits + self.misses
        return (self.hits / total) if total > 0 else 0.0


class SpatialGridIndex:
    """
    Sub-millisecond in-memory 2D Spatial Grid Index.
    Partitions incident coordinates into spatial buckets (~0.02 deg ≈ 2.2 km).
    Provides rapid candidate retrieval for viewport bounding box queries.
    """
    def __init__(self, cell_size_deg: float = 0.02):
        self.cell_size = cell_size_deg
        self._grid: Dict[Tuple[int, int], Set[str]] = {}
        self._incidents: Dict[str, Dict[str, Any]] = {}
        self._lock = threading.RLock()

    def _coord_to_cell(self, lat: float, lon: float) -> Tuple[int, int]:
        cx = int(math.floor(lat / self.cell_size))
        cy = int(math.floor(lon / self.cell_size))
        return (cx, cy)

    def add_or_update(self, incident_data: Dict[str, Any]) -> None:
        inc_id = incident_data["id"]
        lat = incident_data["coordinates"]["latitude"]
        lon = incident_data["coordinates"]["longitude"]
        new_cell = self._coord_to_cell(lat, lon)

        with self._lock:
            # If already present, clean old cell if coordinates changed
            if inc_id in self._incidents:
                old_inc = self._incidents[inc_id]
                old_cell = self._coord_to_cell(
                    old_inc["coordinates"]["latitude"],
                    old_inc["coordinates"]["longitude"]
                )
                if old_cell != new_cell and old_cell in self._grid:
                    self._grid[old_cell].discard(inc_id)

            self._incidents[inc_id] = incident_data
            if new_cell not in self._grid:
                self._grid[new_cell] = set()
            self._grid[new_cell].add(inc_id)

    def remove(self, incident_id: str) -> None:
        with self._lock:
            if incident_id in self._incidents:
                inc = self._incidents.pop(incident_id)
                cell = self._coord_to_cell(
                    inc["coordinates"]["latitude"],
                    inc["coordinates"]["longitude"]
                )
                if cell in self._grid:
                    self._grid[cell].discard(incident_id)

    def query_viewport(
        self,
        min_lat: Optional[float] = None,
        max_lat: Optional[float] = None,
        min_lon: Optional[float] = None,
        max_lon: Optional[float] = None,
        status_filter: Optional[str] = None,
        limit: int = 250
    ) -> List[Dict[str, Any]]:
        """
        Executes bounded spatial search across grid buckets, returning sorted matches.
        """
        with self._lock:
            # If no bounds provided, return top incidents by timestamp
            if min_lat is None and max_lat is None and min_lon is None and max_lon is None:
                candidates = list(self._incidents.values())
            else:
                # Find range of grid cells intersecting requested bounding box
                min_c_lat = int(math.floor((min_lat if min_lat is not None else -90.0) / self.cell_size))
                max_c_lat = int(math.floor((max_lat if max_lat is not None else 90.0) / self.cell_size))
                min_c_lon = int(math.floor((min_lon if min_lon is not None else -180.0) / self.cell_size))
                max_c_lon = int(math.floor((max_lon if max_lon is not None else 180.0) / self.cell_size))

                # Clamp cell range to avoid excessive looping if bounding box is huge
                max_c_lat = min(max_c_lat, min_c_lat + 200)
                max_c_lon = min(max_c_lon, min_c_lon + 200)

                matched_ids: Set[str] = set()
                for cx in range(min_c_lat, max_c_lat + 1):
                    for cy in range(min_c_lon, max_c_lon + 1):
                        cell = (cx, cy)
                        if cell in self._grid:
                            matched_ids.update(self._grid[cell])

                candidates = [self._incidents[i_id] for i_id in matched_ids if i_id in self._incidents]

            # Exact geometric and status filtering
            results = []
            for inc in candidates:
                if status_filter and inc.get("status") != status_filter:
                    continue
                coords = inc["coordinates"]
                lat = coords["latitude"]
                lon = coords["longitude"]
                if min_lat is not None and lat < min_lat:
                    continue
                if max_lat is not None and lat > max_lat:
                    continue
                if min_lon is not None and lon < min_lon:
                    continue
                if max_lon is not None and lon > max_lon:
                    continue
                results.append(inc)

            # Sort descending by timestamp
            results.sort(key=lambda x: x.get("timestamp") or "", reverse=True)
            return results[:limit]

    def size(self) -> int:
        with self._lock:
            return len(self._incidents)


# Global singletons
spatial_cache = SpatialLRUCache(maxsize=4096, default_ttl_sec=30.0)
spatial_grid = SpatialGridIndex(cell_size_deg=0.02)
