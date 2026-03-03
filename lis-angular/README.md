# LIS Angular

Laboratory Information System — reimplemented with **Angular 19** (frontend), **Express + TypeScript** (API), and **SQLite** (database).

## Architecture

```
lis-angular/
├── backend/      Express + TypeScript REST API with SQLite (better-sqlite3)
├── frontend/     Angular 19 SPA (standalone components, signals, lazy routes)
└── tools/        Migration utilities (JSON → SQLite)
```

## Quick Start

### 1. Backend

```bash
cd backend
npm install
npm run dev        # starts at http://localhost:3000
```

On first run it creates `data/lis.db` with schema and seeds an admin user:
- **Email:** admin@lab.com
- **Password:** password123

### 2. Frontend

```bash
cd frontend
npm install
npx ng serve       # starts at http://localhost:4200 → proxied to :3000/api
```

Open **http://localhost:4200** and log in.

### 3. Migrate Old Data

To import data from the old `lis-fullstack` JSON database:

```bash
cd tools
npx ts-node migrate-json-to-sqlite.ts \
  --data ../lis-fullstack/data.json \
  --users ../lis-fullstack/data-users.json \
  --db ../backend/data/lis.db
```

If the user file is encrypted (AES-256-GCM), pass `--key <hex-key>`.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Angular 19 (standalone, signals, `@if`/`@for` control flow) |
| Styling | SCSS with a clean custom design |
| API | Express 4 + TypeScript |
| Database | SQLite 3 via `better-sqlite3` (WAL mode, foreign keys) |
| Auth | JWT (access tokens, bcrypt password hashing) |
| Migrations | Custom TypeScript tool for JSON → SQLite |

## Features

- **Dashboard** — live stats (patients, tests by status & type)
- **Patients** — CRUD, search, pagination, auto-generated code
- **Tests** — create (batch), result entry (30+ test types), release
- **Reception** — area queues with SSE real-time updates
- **Reports** — printable lab reports per test
- **Templates** — manage report templates per test type
- **Users** — CRUD, role/permission management
- **Settings** — lab info, database backup/export

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/register` | Register |
| GET | `/api/auth/me` | Current user |
| GET/POST/PUT/DELETE | `/api/patients/*` | Patient CRUD |
| GET/POST/PUT/DELETE | `/api/tests/*` | Test CRUD + results + status |
| GET/POST | `/api/reception/*` | Reception queues + SSE |
| GET/PUT | `/api/settings` | Settings + backup |
| GET/POST/PUT/DELETE | `/api/users/*` | User management |
| GET/POST/PUT/DELETE | `/api/templates/*` | Template management |
| GET | `/api/dashboard` | Dashboard stats |

## Scripts

### Backend
- `npm run dev` — start with ts-node + auto-reload
- `npm run build` — compile TypeScript → dist/
- `npm start` — run compiled JS

### Frontend
- `npx ng serve` — dev server with HMR
- `npx ng build` — production build → dist/frontend/
