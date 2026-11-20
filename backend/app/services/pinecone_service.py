"""
pinecone_service.py
~~~~~~~~~~~~~~~~~~~
Pinecone Vector Database Service for ultra-fast response times & semantic caching.

Features:
1. Vector Embeddings: Leverages Pinecone's hosted Inference API (multilingual-e5-large, 1024-dim).
2. Semantic Evaluation Cache: Caches CV screening & scoring evaluations by content hash & cosine similarity.
   Subsequent screenings for identical or near-identical CVs/JDs resolve in < 50ms instead of 10s LLM roundtrips.
3. Candidate Semantic Search: Fast natural-language candidate discovery across indexed profiles.
4. Telemetry & Health Monitoring: Index connectivity, host metadata, vector count, and cache hit metrics.
5. Fault-Tolerant: Seamless fallback if Pinecone is unreachable; never crashes the main pipeline.
"""
import hashlib
import json
import logging
import time
from typing import Any, Dict, List, Optional, Tuple

import requests
from app.core.config import settings

logger = logging.getLogger(__name__)


class PineconeCacheService:
    def __init__(self):
        self._cached_host: Optional[str] = None
        self._host_checked_at: float = 0.0
        self._cache_hits: int = 0
        self._cache_misses: int = 0
        self._last_latency_ms: float = 0.0

    @property
    def api_key(self) -> Optional[str]:
        return (settings.PINECONE_API_KEY or "").strip() or None

    @property
    def index_name(self) -> str:
        return (settings.PINECONE_INDEX_NAME or "job-tracker-cache").strip()

    @property
    def embed_model(self) -> str:
        return getattr(settings, "PINECONE_EMBED_MODEL", "multilingual-e5-large")

    def is_configured(self) -> bool:
        return bool(self.api_key and not self.api_key.startswith("your_"))

    def _get_headers(self) -> Dict[str, str]:
        return {
            "Api-Key": self.api_key or "",
            "Content-Type": "application/json",
            "X-Pinecone-API-Version": "2024-10",
        }

    def get_index_host(self) -> Optional[str]:
        """Resolves and caches the Pinecone index host URL."""
        if not self.is_configured():
            return None

        # Return cached host if refreshed within 10 minutes
        now = time.time()
        if self._cached_host and (now - self._host_checked_at) < 600:
            return self._cached_host

        # Direct override from settings if provided
        if getattr(settings, "PINECONE_HOST", None):
            self._cached_host = settings.PINECONE_HOST
            self._host_checked_at = now
            return self._cached_host

        try:
            url = f"https://api.pinecone.io/indexes/{self.index_name}"
            resp = requests.get(url, headers=self._get_headers(), timeout=5.0)
            if resp.status_code == 200:
                data = resp.json()
                host = data.get("host")
                if host:
                    self._cached_host = host
                    self._host_checked_at = now
                    return host
            elif resp.status_code == 404:
                # Index doesn't exist yet, attempt to auto-create serverless index
                self._auto_create_index()
                return self._cached_host
            else:
                logger.warning("Pinecone describe index error: %s - %s", resp.status_code, resp.text)
        except Exception as exc:
            logger.warning("Could not resolve Pinecone index host: %s", exc)

        return self._cached_host

    def _auto_create_index(self) -> None:
        """Auto-creates the serverless cache index if absent."""
        try:
            create_url = "https://api.pinecone.io/indexes"
            payload = {
                "name": self.index_name,
                "dimension": 1024,
                "metric": "cosine",
                "spec": {
                    "serverless": {
                        "cloud": "aws",
                        "region": "us-east-1",
                    }
                },
            }
            resp = requests.post(create_url, headers=self._get_headers(), json=payload, timeout=10.0)
            if resp.status_code in (200, 201):
                data = resp.json()
                self._cached_host = data.get("host")
                self._host_checked_at = time.time()
                logger.info("Auto-created Pinecone cache index '%s': host=%s", self.index_name, self._cached_host)
            else:
                logger.warning("Pinecone auto-create index error: %s %s", resp.status_code, resp.text)
        except Exception as exc:
            logger.warning("Pinecone auto-create index failed: %s", exc)

    def generate_embedding(self, text: str) -> Optional[List[float]]:
        """
        Embeds a text string using Pinecone Hosted Inference (1024 dimensions).
        Truncates input safely to max passage length.
        """
        if not self.is_configured() or not text:
            return None

        clean_text = text.strip()[:8000]
        try:
            embed_url = "https://api.pinecone.io/embed"
            payload = {
                "model": self.embed_model,
                "parameters": {"input_type": "passage", "truncate": "END"},
                "inputs": [{"text": clean_text}],
            }
            resp = requests.post(embed_url, headers=self._get_headers(), json=payload, timeout=5.0)
            if resp.status_code == 200:
                data = resp.json()
                vectors = data.get("data", [])
                if vectors and "values" in vectors[0]:
                    return vectors[0]["values"]
            else:
                logger.warning("Pinecone embed error %s: %s", resp.status_code, resp.text[:200])
        except Exception as exc:
            logger.warning("Pinecone embedding generation failed: %s", exc)

        return None

    def compute_cache_key(self, cv_text: str, jd_text: str, pass_mark: int = 80) -> str:
        """Computes a deterministic content hash for CV + JD evaluation caching."""
        normalized = f"{cv_text.strip().lower()}|||{jd_text.strip().lower()}|||{pass_mark}"
        digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
        return f"eval-{digest[:32]}"

    # ── Fast Semantic Response Cache ─────────────────────────────────────────

    def get_cached_screening(
        self,
        cv_text: str,
        jd_text: str,
        pass_mark: int = 80,
    ) -> Optional[Dict[str, Any]]:
        """
        Checks Pinecone vector database for a cached CV screening evaluation:
        1. Exact hash key fetch (< 30ms latency).
        2. Semantic similarity vector search if no exact hash match (threshold >= 0.98).
        Returns structured evaluation dict or None.
        """
        if not self.is_configured():
            return None

        host = self.get_index_host()
        if not host:
            return None

        t0 = time.perf_counter()
        key_id = self.compute_cache_key(cv_text, jd_text, pass_mark)

        # 1. Exact ID Fetch
        try:
            fetch_url = f"https://{host}/vectors/fetch?ids={key_id}"
            resp = requests.get(fetch_url, headers=self._get_headers(), timeout=3.0)
            if resp.status_code == 200:
                data = resp.json()
                vectors = data.get("vectors", {})
                if key_id in vectors:
                    meta = vectors[key_id].get("metadata", {})
                    eval_json = meta.get("evaluation_json")
                    if eval_json:
                        parsed = json.loads(eval_json)
                        self._cache_hits += 1
                        latency = (time.perf_counter() - t0) * 1000
                        self._last_latency_ms = round(latency, 2)
                        parsed["cached"] = True
                        parsed["cache_type"] = "exact_hash"
                        parsed["cache_latency_ms"] = self._last_latency_ms
                        logger.info("Pinecone exact cache hit: key=%s (latency=%.1fms)", key_id, latency)
                        return parsed
        except Exception as exc:
            logger.warning("Pinecone exact fetch exception: %s", exc)

        # 2. Vector Similarity Query for semantic match
        try:
            emb = self.generate_embedding(f"{cv_text[:2000]}\n\nTarget JD: {jd_text[:1000]}")
            if emb:
                query_url = f"https://{host}/query"
                payload = {
                    "vector": emb,
                    "topK": 1,
                    "includeMetadata": True,
                    "filter": {"type": {"$eq": "cv_screening"}, "pass_mark": {"$eq": pass_mark}},
                }
                resp = requests.post(query_url, headers=self._get_headers(), json=payload, timeout=3.0)
                if resp.status_code == 200:
                    matches = resp.json().get("matches", [])
                    if matches and matches[0].get("score", 0) >= 0.985:
                        match = matches[0]
                        meta = match.get("metadata", {})
                        eval_json = meta.get("evaluation_json")
                        if eval_json:
                            parsed = json.loads(eval_json)
                            self._cache_hits += 1
                            latency = (time.perf_counter() - t0) * 1000
                            self._last_latency_ms = round(latency, 2)
                            parsed["cached"] = True
                            parsed["cache_type"] = "semantic_vector"
                            parsed["similarity"] = round(match["score"], 4)
                            parsed["cache_latency_ms"] = self._last_latency_ms
                            logger.info(
                                "Pinecone semantic cache hit: score=%.4f (latency=%.1fms)",
                                match["score"],
                                latency,
                            )
                            return parsed
        except Exception as exc:
            logger.warning("Pinecone semantic query exception: %s", exc)

        self._cache_misses += 1
        return None

    def cache_screening(
        self,
        candidate_id: Optional[str],
        cv_text: str,
        jd_text: str,
        evaluation: Dict[str, Any],
        pass_mark: int = 80,
    ) -> bool:
        """
        Asynchronously stores structured screening evaluation into Pinecone vector cache.
        """
        if not self.is_configured():
            return False

        host = self.get_index_host()
        if not host:
            return False

        try:
            key_id = self.compute_cache_key(cv_text, jd_text, pass_mark)
            text_to_embed = f"{cv_text[:2000]}\n\nTarget JD: {jd_text[:1000]}"
            emb = self.generate_embedding(text_to_embed)
            if not emb:
                return False

            metadata = {
                "type": "cv_screening",
                "candidate_id": str(candidate_id or ""),
                "pass_mark": pass_mark,
                "score": float(evaluation.get("score") or 0.0),
                "recommendation": str(evaluation.get("recommendation") or ""),
                "evaluation_json": json.dumps(evaluation),
                "cached_at": time.time(),
            }

            upsert_url = f"https://{host}/vectors/upsert"
            payload = {
                "vectors": [
                    {
                        "id": key_id,
                        "values": emb,
                        "metadata": metadata,
                    }
                ]
            }
            resp = requests.post(upsert_url, headers=self._get_headers(), json=payload, timeout=4.0)
            if resp.status_code == 200:
                logger.info("Pinecone cached evaluation successfully: key=%s", key_id)
                return True
            else:
                logger.warning("Pinecone upsert error %s: %s", resp.status_code, resp.text[:200])
        except Exception as exc:
            logger.warning("Pinecone cache upsert failed: %s", exc)

        return False

    # ── Candidate Semantic Search ────────────────────────────────────────────

    def search_similar_candidates(
        self,
        query: str,
        top_k: int = 5,
        pass_mark: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        """
        Searches candidates across the Pinecone vector database using semantic similarity.
        """
        if not self.is_configured() or not query.strip():
            return []

        host = self.get_index_host()
        if not host:
            return []

        emb = self.generate_embedding(query)
        if not emb:
            return []

        try:
            query_url = f"https://{host}/query"
            filt = {"type": {"$eq": "cv_screening"}}
            if pass_mark is not None:
                filt["pass_mark"] = {"$eq": pass_mark}

            payload = {
                "vector": emb,
                "topK": top_k,
                "includeMetadata": True,
                "filter": filt,
            }
            resp = requests.post(query_url, headers=self._get_headers(), json=payload, timeout=4.0)
            if resp.status_code == 200:
                matches = resp.json().get("matches", [])
                results = []
                for m in matches:
                    meta = m.get("metadata", {})
                    eval_obj = {}
                    if meta.get("evaluation_json"):
                        try:
                            eval_obj = json.loads(meta["evaluation_json"])
                        except Exception:
                            pass
                    results.append(
                        {
                            "id": m.get("id"),
                            "score": round(m.get("score", 0.0), 4),
                            "candidate_id": meta.get("candidate_id"),
                            "cv_score": meta.get("score"),
                            "recommendation": meta.get("recommendation"),
                            "evaluation": eval_obj,
                        }
                    )
                return results
        except Exception as exc:
            logger.warning("Pinecone search candidates exception: %s", exc)

        return []

    # ── Health & Diagnostics ─────────────────────────────────────────────────

    def get_status(self) -> Dict[str, Any]:
        """
        Diagnostics endpoint returning Pinecone connectivity, latency, and index stats.
        Never throws unhandled exceptions.
        """
        if not self.is_configured():
            return {
                "status": "unconfigured",
                "is_connected": False,
                "message": "PINECONE_API_KEY is not configured in .env",
                "index_name": self.index_name,
                "host": None,
                "total_vectors": 0,
                "dimension": 1024,
                "latency_ms": 0.0,
                "cache_hits": self._cache_hits,
                "cache_misses": self._cache_misses,
            }

        t0 = time.perf_counter()
        host = self.get_index_host()
        if not host:
            return {
                "status": "degraded",
                "is_connected": False,
                "message": "Index host could not be resolved from Pinecone control plane.",
                "index_name": self.index_name,
                "host": None,
                "total_vectors": 0,
                "dimension": 1024,
                "latency_ms": round((time.perf_counter() - t0) * 1000, 2),
                "cache_hits": self._cache_hits,
                "cache_misses": self._cache_misses,
            }

        try:
            stats_url = f"https://{host}/describe_index_stats"
            resp = requests.post(stats_url, headers=self._get_headers(), json={}, timeout=4.0)
            latency_ms = round((time.perf_counter() - t0) * 1000, 2)
            self._last_latency_ms = latency_ms

            if resp.status_code == 200:
                stats = resp.json()
                total_vectors = stats.get("totalVectorCount", 0)
                dim = stats.get("dimension", 1024)
                return {
                    "status": "connected",
                    "is_connected": True,
                    "index_name": self.index_name,
                    "host": host,
                    "total_vectors": total_vectors,
                    "dimension": dim,
                    "latency_ms": latency_ms,
                    "embedding_model": self.embed_model,
                    "cloud": "aws",
                    "region": "us-east-1",
                    "cache_hits": self._cache_hits,
                    "cache_misses": self._cache_misses,
                    "cache_mode": "Fast Semantic Caching & Instant Response",
                }
            else:
                return {
                    "status": "degraded",
                    "is_connected": False,
                    "message": f"Describe stats returned HTTP {resp.status_code}: {resp.text[:100]}",
                    "index_name": self.index_name,
                    "host": host,
                    "total_vectors": 0,
                    "dimension": 1024,
                    "latency_ms": latency_ms,
                    "cache_hits": self._cache_hits,
                    "cache_misses": self._cache_misses,
                }
        except Exception as exc:
            latency_ms = round((time.perf_counter() - t0) * 1000, 2)
            return {
                "status": "error",
                "is_connected": False,
                "message": str(exc),
                "index_name": self.index_name,
                "host": host,
                "total_vectors": 0,
                "dimension": 1024,
                "latency_ms": latency_ms,
                "cache_hits": self._cache_hits,
                "cache_misses": self._cache_misses,
            }


pinecone_service = PineconeCacheService()
