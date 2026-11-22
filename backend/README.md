# Hiring Loop Backend (FastAPI)
> Hire faster, with you in control.

A production-ready FastAPI backend built with SQLModel, PostgreSQL (Neon / Supabase), Pydantic Settings, JWT Authentication, and AI-powered services (Google Gemini / Groq free tier).

## Project Structure

```text
backend/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI app instance, CORS middleware, lifespan, routers
│   ├── db.py                # SQLModel engine (Neon-optimized) & session dependency
│   ├── core/
│   │   ├── __init__.py
│   │   ├── config.py        # Settings loaded from .env via pydantic-settings
│   │   ├── security.py      # Password hashing (bcrypt) & JWT creation/verification
│   │   └── dependencies.py  # get_current_user auth dependency
│   ├── models/
│   │   ├── __init__.py
│   │   ├── user.py          # User (UUID PK, email unique, hashed_password)
│   │   ├── application.py   # Application (FK->User, status enum, JD, notes)
│   │   ├── cv_version.py    # CVVersion (FK->User, FK->Application nullable, is_base)
│   │   └── job.py           # Legacy job model
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── auth.py          # RegisterRequest, LoginRequest, UserPublic, TokenResponse
│   │   ├── application.py   # ApplicationCreate, ApplicationUpdate, PaginatedApplications
│   │   ├── ai.py            # TailorCVRequest/Response, InterviewQuestionsRequest/Response
│   │   └── health.py        # HealthResponse
│   ├── services/
│   │   ├── __init__.py
│   │   ├── ai.py            # Gemini / Groq CV tailoring & interview question generation
│   │   ├── auth_service.py  # User registration, login, and verification
│   │   ├── application_service.py # Scoped application queries with 404/403 security
│   │   └── job_service.py   # Job service
│   └── routers/
│       ├── __init__.py
│       ├── ai.py            # POST /ai/tailor-cv, POST /ai/interview-questions
│       ├── applications.py  # CRUD & PATCH /applications/{id}/status (scoped to user)
│       ├── auth.py          # POST /auth/register, POST /auth/login, GET /auth/me
│       ├── health.py        # GET /health
│       ├── jobs.py          # /api/v1/jobs CRUD endpoints
│       └── api.py           # API v1 router aggregator
├── migrations/              # Alembic database migrations
├── tests/
│   ├── __init__.py
│   ├── test_ai.py           # Unit tests for AI service & error handling
│   └── test_health.py       # Health endpoint tests
├── .env.example             # Example environment configuration
├── .env                     # Local environment configuration
├── .gitignore               # Git ignore rules
└── requirements.txt         # Project dependencies
```

---

## AI Services (Gemini / Groq)

The AI module in `app/services/ai.py` supports both **Google Gemini** (default) and **Groq** free APIs with structured JSON output, timeouts, and error handling.

### Getting a Free API Key
- **Google Gemini (Recommended)**: [Google AI Studio](https://aistudio.google.com/) -> "Get API Key"
- **Groq**: [Groq Console](https://console.groq.com/) -> "API Keys"

Add your key to `backend/.env`:
```env
# AI Service Keys (Gemini or Groq free tier)
GEMINI_API_KEY=your_gemini_api_key_here
GROQ_API_KEY=
AI_TIMEOUT_SECONDS=30.0
```

### Endpoints

Both `/ai/...` and `/api/v1/ai/...` are supported:

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/ai/tailor-cv` | Tailor a CV's bullet points to match target JD keywords without fabricating fake experience |
| `POST` | `/ai/interview-questions` | Generate targeted technical, architectural, and behavioral interview questions from a JD |

#### 1. Tailor CV Request & Response
```json
// POST /ai/tailor-cv
{
  "base_cv": "Software Engineer with 3 years experience building Python web APIs...",
  "job_description": "We are seeking a Backend Engineer with strong FastAPI, SQLModel, and PostgreSQL skills..."
}

// Response (200 OK)
{
  "tailored_cv": "# Professional Summary\n* Spearheaded high-throughput FastAPI REST APIs backed by PostgreSQL...",
  "matched_keywords": ["FastAPI", "SQLModel", "PostgreSQL", "REST APIs"],
  "changes_summary": "Rephrased bullet points to highlight FastAPI and SQLModel experience without adding fake roles."
}
```

#### 2. Interview Questions Request & Response
```json
// POST /ai/interview-questions
{
  "job_description": "Senior Backend Engineer with FastAPI, PostgreSQL, and distributed caching experience.",
  "count": 5
}

// Response (200 OK)
{
  "questions": [
    "How do you handle connection pooling and stale connections when connecting FastAPI to serverless PostgreSQL (like Neon)?",
    "Explain how you design idempotency for payment or job application submission endpoints.",
    "Can you describe a challenging database performance issue you diagnosed and resolved?",
    "How do you implement and rotate JWT secrets in a production microservice?",
    "Describe a time you had to balance technical debt with urgent product delivery deadlines."
  ]
}
```

---

## Running the Application

```powershell
cd backend
.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8000
```

- Swagger UI API Docs: `http://localhost:8000/docs`
- Redoc API Docs: `http://localhost:8000/redoc`
- Health check: `http://localhost:8000/health`
