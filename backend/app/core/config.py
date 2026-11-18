import json
import secrets
from pathlib import Path
from typing import Optional, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
_ENV_PATH = _BACKEND_DIR / ".env"


class Settings(BaseSettings):
    PROJECT_NAME: str = "Job Tracker API"
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api/v1"
    ENVIRONMENT: str = "development"

    # PostgreSQL (Loaded strictly from .env)
    DATABASE_URL: str = ""

    # CORS origins: supports comma-separated string, JSON array, or Python list
    CORS_ORIGINS: Union[list[str], str] = ["http://localhost:3000"]

    # ── JWT ──────────────────────────────────────────────────────────────────
    # Overridden strictly by .env in production
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24  # 24 hours

    # ── AI Services (OpenRouter via OpenAI SDK) ──────────────────────────────
    OPENROUTER_API_KEY: Optional[str] = None
    OPENROUTER_BASE_URL: str = "https://openrouter.ai/api/v1"
    MODELS_SCREENING: str = "nvidia/nemotron-3-ultra-550b-a55b:free,thinkingmachines/inkling-2-small:free,google/gemma-4-31b-it:free"
    MODELS_EXTRACTION: str = "google/gemma-4-26b-a4b-it:free,nvidia/nemotron-3.5-lightning:free,google/gemma-4-31b-it:free"
    MODELS_QUESTIONS: str = "thinkingmachines/inkling-2-small:free,google/gemma-4-31b-it:free,nvidia/nemotron-3-ultra-550b-a55b:free"
    MODELS_DRAFTS: str = "google/gemma-4-31b-it:free,thinkingmachines/inkling-2-small:free,google/gemma-4-26b-a4b-it:free"
    MODELS_VISION: str = "nvidia/nemotron-3.5-super-vl:free"
    AI_TIMEOUT_SECONDS: float = 60.0

    # Deprecated single-model fields for backwards compatibility
    MODEL_CV_TAILOR: Optional[str] = None
    MODEL_INTERVIEW: Optional[str] = None
    MODEL_FALLBACK: Optional[str] = None

    def get_models_for_task(self, task: str) -> list[str]:
        """Return parsed list of model IDs for a given task chain."""
        # Support legacy test overrides if present
        if task.lower() in ("questions", "interview"):
            legacy = getattr(self, "MODEL_INTERVIEW", None)
            fallback = getattr(self, "MODEL_FALLBACK", None)
            if legacy and ("primary" in legacy or "fallback" in str(fallback)):
                return [m for m in [legacy, fallback] if m]
        elif task.lower() in ("screening", "cv_tailor"):
            legacy = getattr(self, "MODEL_CV_TAILOR", None)
            fallback = getattr(self, "MODEL_FALLBACK", None)
            if legacy and ("primary" in legacy or "fallback" in str(fallback)):
                return [m for m in [legacy, fallback] if m]

        task_map = {
            "screening": self.MODELS_SCREENING,
            "extraction": self.MODELS_EXTRACTION,
            "questions": self.MODELS_QUESTIONS,
            "drafts": self.MODELS_DRAFTS,
            "vision": self.MODELS_VISION,
        }
        val = task_map.get(task.lower(), self.MODELS_SCREENING)
        return [m.strip() for m in val.split(",") if m.strip()]

    # ── Google OAuth2 & Gmail Integration ────────────────────────────────────
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/auth/google/callback"
    GOOGLE_PROJECT_ID: Optional[str] = None
    GOOGLE_AUTH_URI: str = "https://accounts.google.com/o/oauth2/auth"
    GOOGLE_TOKEN_URI: str = "https://oauth2.googleapis.com/token"
    GOOGLE_AUTH_PROVIDER_CERT_URL: Optional[str] = None
    GOOGLE_JAVASCRIPT_ORIGINS: Optional[str] = None
    GOOGLE_ENCRYPTION_KEY: Optional[str] = None
    FRONTEND_URL: str = "http://localhost:3000"

    # ── WhatsApp Cloud API ───────────────────────────────────────────────────
    WHATSAPP_TOKEN: Optional[str] = None
    PHONE_NUMBER_ID: Optional[str] = None
    VERIFY_TOKEN: Optional[str] = None
    APP_SECRET: Optional[str] = None
    WHATSAPP_API_VERSION: str = "v25.0"
    WHATSAPP_DEFAULT_TEMPLATE: str = "hello_world"

    # Supabase Storage Integration
    SUPABASE_URL: Optional[str] = None
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = None
    SUPABASE_STORAGE_BUCKET: str = "resumes"

    # Legacy AI keys (kept for backwards compatibility)
    GEMINI_API_KEY: Optional[str] = None
    GROQ_API_KEY: Optional[str] = None

    @field_validator("CORS_ORIGINS", mode="after")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, list[str]]) -> list[str]:
        if isinstance(v, str):
            # Check if it's formatted as a JSON array e.g. ["http://localhost:3000"]
            stripped = v.strip()
            if stripped.startswith("[") and stripped.endswith("]"):
                try:
                    parsed = json.loads(stripped)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed]
                except json.JSONDecodeError:
                    pass
            # Comma-separated values e.g. "http://localhost:3000,http://127.0.0.1:3000"
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return [str(item).strip() for item in v]

    @property
    def sync_database_url(self) -> str:
        """
        Ensures the database connection string is properly formatted for SQLAlchemy / SQLModel.
        Converts legacy 'postgres://' to 'postgresql://'.
        """
        url = self.DATABASE_URL
        if url.startswith("postgres://"):
            return url.replace("postgres://", "postgresql://", 1)
        return url

    model_config = SettingsConfigDict(
        env_file=(_ENV_PATH, ".env", "backend/.env"),
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
