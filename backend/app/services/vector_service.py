"""
app/services/vector_service.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Optional vector service powered by Pinecone.
Strictly decoupled from caching:
  - DO NOT USE PINECONE AS A CACHE.
  - Activated ONLY if both PINECONE_API_KEY and PINECONE_INDEX (or PINECONE_INDEX_NAME) are set in .env.
  - Used ONLY for:
      1. Embedding candidate CVs and calculating semantic match against job descriptions.
      2. Finding similar candidates ("find similar candidates").
  - The AI score flow operates normally if Pinecone is disabled or unavailable.
  - API keys and secrets stay strictly in environment variables.
"""
import hashlib
import logging
import math
import os
from typing import Any, Dict, List, Optional
import uuid

from app.core.config import settings

logger = logging.getLogger(__name__)


def _simple_text_embedding(text: str, dim: int = 1536) -> List[float]:
    """
    Generates a deterministic normalized dense vector for a given text.
    Used as an offline/fallback embedding if remote embedding APIs are not configured.
    """
    cleaned = text.lower().strip()
    vector = [0.0] * dim
    words = cleaned.split()
    if not words:
        vector[0] = 1.0
        return vector

    for i, word in enumerate(words):
        # Stable hash projection across dimensions
        h = int(hashlib.md5(word.encode("utf-8")).hexdigest(), 16)
        idx = h % dim
        weight = 1.0 / (1.0 + math.log(i + 1))
        vector[idx] += weight

    # L2 normalize
    norm = math.sqrt(sum(x * x for x in vector))
    if norm > 0:
        vector = [x / norm for x in vector]
    else:
        vector[0] = 1.0
    return vector


class VectorService:
    def __init__(self):
        self._client = None
        self._index = None
        self._enabled = False
        self._init_client()

    def _init_client(self) -> None:
        api_key = os.getenv("PINECONE_API_KEY") or settings.PINECONE_API_KEY
        index_name = (
            os.getenv("PINECONE_INDEX")
            or os.getenv("PINECONE_INDEX_NAME")
            or settings.PINECONE_INDEX
            or getattr(settings, "PINECONE_INDEX_NAME", None)
        )

        if not api_key or not index_name:
            self._enabled = False
            logger.info("Pinecone vector service disabled (PINECONE_API_KEY or PINECONE_INDEX not configured in .env).")
            return

        try:
            from pinecone import Pinecone
            self._client = Pinecone(api_key=api_key.strip())
            self._index_name = index_name.strip()
            self._enabled = True
            logger.info("Pinecone vector service enabled with index target: %s", index_name)
        except Exception as exc:
            self._enabled = False
            self._client = None
            self._index = None
            logger.warning("Pinecone client initialization failed: %s. Vector service disabled.", exc)

    def _get_index(self):
        """Lazily connects to the Pinecone index with error protection."""
        if not self._enabled or not self._client:
            return None
        if self._index is not None:
            return self._index
        try:
            self._index = self._client.Index(self._index_name)
            return self._index
        except Exception as exc:
            logger.warning("Pinecone index connection failed: %s", exc)
            return None

    def is_enabled(self) -> bool:
        """Returns True only if Pinecone is configured and ready."""
        return self._enabled and self._client is not None

    def _get_embedding(self, text: str) -> List[float]:
        """
        Creates dense embedding for text.
        Tries OpenAI / Pinecone embedding models if available, otherwise deterministic embedding.
        """
        # 1. Try OpenAI embedding if key is present
        openai_key = os.getenv("OPENAI_API_KEY")
        if openai_key:
            try:
                import openai
                client = openai.OpenAI(api_key=openai_key)
                res = client.embeddings.create(input=text[:8000], model="text-embedding-3-small")
                return res.data[0].embedding
            except Exception as exc:
                logger.debug("OpenAI embedding generation failed, using fallback: %s", exc)

        # 2. Try Pinecone Inference if client has inference capability
        if self._client and hasattr(self._client, "inference"):
            try:
                embed_res = self._client.inference.embed(
                    model="multilingual-e5-large",
                    inputs=[text[:2000]],
                    parameters={"input_type": "passage", "truncate": "END"},
                )
                if embed_res and len(embed_res) > 0:
                    return embed_res[0].values
            except Exception as exc:
                logger.debug("Pinecone inference embedding failed, using fallback: %s", exc)

        # 3. Deterministic dense projection
        return _simple_text_embedding(text)

    def index_candidate_cv(
        self,
        candidate_id: str,
        candidate_name: str,
        cv_text: str,
        opening_id: Optional[str] = None,
        score: Optional[float] = None,
    ) -> bool:
        """
        Embeds a candidate's CV and indexes the vector in Pinecone for semantic matching & similarity search.
        Never stores private authentication credentials.
        """
        idx = self._get_index()
        if not idx:
            return False

        if not cv_text or not cv_text.strip():
            return False

        try:
            vector = self._get_embedding(cv_text)
            metadata = {
                "candidate_id": str(candidate_id),
                "name": candidate_name[:100],
                "opening_id": str(opening_id) if opening_id else "",
                "score": float(score) if score is not None else 0.0,
                "cv_snippet": cv_text[:300].strip(),
            }

            idx.upsert(
                vectors=[
                    {
                        "id": f"cand_{candidate_id}",
                        "values": vector,
                        "metadata": metadata,
                    }
                ]
            )
            logger.info("Indexed candidate vector in Pinecone: candidate_id=%s", candidate_id)
            return True
        except Exception as exc:
            logger.warning("Failed to index candidate in Pinecone: %s", exc)
            return False

    def match_cv_to_job(self, cv_text: str, job_description: str) -> Optional[float]:
        """
        Calculates semantic match score (0.0 to 100.0) between a candidate's CV and job description
        using cosine similarity of their vector embeddings.
        Returns None if vector service is disabled.
        """
        if not self.is_enabled():
            return None

        if not cv_text or not job_description:
            return None

        try:
            vec_cv = self._get_embedding(cv_text)
            vec_jd = self._get_embedding(job_description)

            # Cosine similarity
            dot_product = sum(a * b for a, b in zip(vec_cv, vec_jd))
            norm_cv = math.sqrt(sum(a * a for a in vec_cv))
            norm_jd = math.sqrt(sum(b * b for b in vec_jd))

            if norm_cv == 0 or norm_jd == 0:
                return None

            sim = dot_product / (norm_cv * norm_jd)
            # Map cosine [-1, 1] or [0, 1] to a 0-100 score
            score_100 = round(max(0.0, min(100.0, sim * 100.0)), 1)
            return score_100
        except Exception as exc:
            logger.warning("Error calculating CV to JD vector match: %s", exc)
            return None

    def find_similar_candidates(
        self,
        candidate_id: str,
        top_k: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        Finds candidates with similar background/skills based on Pinecone vector cosine similarity.
        Returns empty list if Pinecone is disabled.
        """
        idx = self._get_index()
        if not idx:
            return []

        vec_id = f"cand_{candidate_id}"
        try:
            # Query by vector id
            fetch_res = idx.fetch(ids=[vec_id])
            vectors = getattr(fetch_res, "vectors", {}) or {}
            cand_vector_data = vectors.get(vec_id)

            if not cand_vector_data or not getattr(cand_vector_data, "values", None):
                logger.info("Candidate vector %s not found in Pinecone for similarity search.", vec_id)
                return []

            target_vector = cand_vector_data.values
            query_res = idx.query(
                vector=target_vector,
                top_k=top_k + 1,
                include_metadata=True,
            )

            similar = []
            matches = getattr(query_res, "matches", []) or []
            for match in matches:
                # Exclude the queried candidate itself
                match_id = match.get("id") or getattr(match, "id", "")
                if match_id == vec_id:
                    continue

                raw_meta = match.get("metadata") or getattr(match, "metadata", {}) or {}
                raw_score = match.get("score") or getattr(match, "score", 0.0)
                similar.append(
                    {
                        "candidate_id": raw_meta.get("candidate_id", match_id.replace("cand_", "")),
                        "name": raw_meta.get("name", "Unknown"),
                        "similarity_score": round(float(raw_score) * 100, 1),
                        "opening_id": raw_meta.get("opening_id"),
                        "score": raw_meta.get("score"),
                    }
                )
                if len(similar) >= top_k:
                    break

            return similar
        except Exception as exc:
            logger.warning("Pinecone find_similar_candidates error for %s: %s", candidate_id, exc)
            return []


# Singleton vector service instance
vector_service = VectorService()
