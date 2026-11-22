# Hiring Loop
> **Hire faster, with you in control.**

Hiring Loop is an AI Candidate Screening & Recruiting SaaS copilot that accelerates recruitment pipelines while keeping hiring teams in complete control.

## Key Features

- **Branded & Modern UI**: Sleek, responsive interface with native light & dark mode support and mobile optimization.
- **AI-Powered Screening & Skill Matching**: Deterministic field extraction, skill fit scoring, and candidate ranking.
- **Seamless Google Workspace Integration**: Gmail candidate syncing, Google Calendar event scheduling, Google Meet creation, and Google Sheets candidate sync.
- **Pipeline Kanban & Scheduling**: Unified candidate pipeline management with real-time drag-and-drop updates and interactive Google Calendar availability scheduling.
- **Autonomous Recruiter Agent**: Configurable hiring cycles, interview reminders, automated status dispatching, and deterministic email templates with zero hallucinations.

## Technology Stack

- **Frontend**: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query v5, FullCalendar v7.
- **Backend**: FastAPI, SQLModel / SQLAlchemy, Pydantic v2, PostgreSQL (Supabase pooler), Redis L2 cache, Pinecone vector indexing.
- **Authentication**: JWT authentication with dual-flow Google OAuth2 (Login/Signup & Google Workspace offline integration).

## Getting Started

### 1. Backend Setup
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Or on Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --port 8000 --reload
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to start using Hiring Loop.
