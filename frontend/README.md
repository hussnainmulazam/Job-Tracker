# Hiring Loop Frontend (Next.js 15 + Tailwind + shadcn/ui)
> Hire faster, with you in control.

A modern, responsive frontend for Hiring Loop built with Next.js 15 App Router, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query v5, and Zod + React Hook Form.

---

## Features

- **Next.js 15 (App Router)**: Utilizing server and client components with clean directory routing.
- **Tailwind CSS + shadcn/ui**: Pre-configured with slate theme, CSS variables, and components (`Button`, `Card`, `Badge`, `Input`, `Label`).
- **TanStack Query v5**: Fully integrated with `@tanstack/react-query` and QueryClientProvider in `components/providers.tsx`.
- **Form Validation**: `zod` schema validation paired with `react-hook-form` via `@hookform/resolvers/zod`.
- **Type-safe API Client**: `lib/api.ts` provides a complete fetch wrapper that:
  - Uses `NEXT_PUBLIC_API_URL` for API routing.
  - Automatically retrieves and attaches `Authorization: Bearer <token>` from localStorage.
  - Intercepts `401 Unauthorized` responses, clears expired tokens, and redirects to login.
  - Provides type-safe methods: `api.get<T>()`, `api.post<T>()`, `api.patch<T>()`, `api.delete<T>()`.

---

## Directory Structure

```text
frontend/
├── app/
│   ├── globals.css         # Tailwind directives and shadcn HSL CSS variables
│   ├── layout.tsx          # Root layout with QueryClientProvider & metadata
│   └── page.tsx            # Interactive dashboard demonstrating Query, shadcn, and forms
├── components/
│   ├── providers.tsx       # TanStack QueryClientProvider & Devtools
│   └── ui/                 # shadcn/ui primitives
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── input.tsx
│       └── label.tsx
├── lib/
│   ├── api.ts              # Fetch wrapper with JWT attachment and 401 handling
│   └── utils.ts            # shadcn cn() utility (clsx + tailwind-merge)
├── .env.example            # Example environment configuration
├── .env.local              # Local environment variables
├── components.json         # shadcn/ui configuration
├── next.config.ts          # Next.js configuration
├── package.json            # Dependencies and build scripts
├── postcss.config.mjs      # PostCSS configuration
├── tailwind.config.ts      # Tailwind configuration with shadcn extensions
└── tsconfig.json           # TypeScript configuration with @/* alias
```

---

## Getting Started

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Environment Configuration

Verify or create `frontend/.env.local`:

```env
# Backend API Base URL
NEXT_PUBLIC_API_URL=http://localhost:8000
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to view the application.

### 4. Build for Production

```bash
npm run build
npm run start
```

---

## API Client Usage Example (`lib/api.ts`)

```typescript
import { api, setAuthToken } from "@/lib/api";

// 1. Authenticate and persist JWT
const { access_token } = await api.post<{ access_token: string }>("/api/v1/auth/login", {
  email: "developer@example.com",
  password: "SecurePassword123!",
});
setAuthToken(access_token);

// 2. Fetch authenticated data (JWT is automatically attached)
const applications = await api.get<{ items: Application[]; total: number }>("/api/v1/applications");

// 3. React Query integration
const { data, isLoading } = useQuery({
  queryKey: ["applications"],
  queryFn: () => api.get("/api/v1/applications"),
});
```

