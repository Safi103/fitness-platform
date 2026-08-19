# Fitness Management and Analytics Platform

A full-stack web application for planning workout routines, logging training
sessions in real time, and tracking progress: personal records, training
volume, and progression charts.

**Stack:** React 18 + Vite (frontend) | Node.js + Express (REST API) |
MySQL 8 | JWT authentication | Recharts (visualizations)

## Features

- **Accounts** - registration and login (bcrypt password hashing, JWT sessions). Each
  account stores baseline metrics (age, body weight, height) and a KG/LBS unit
  preference; these are persisted in the database and returned by the API, but an
  editing interface is intentionally out of scope for this version.
- **Exercise catalog** - 29 built-in exercises, server-side search and
  filtering by muscle group and category, plus per-user custom exercises
  (visible only to their creator).
- **Routines** - named programs of ordered exercises with prescribed targets
  (sets, rep range, rest seconds) and weekday scheduling (0 = Sunday).
- **Live workouts** - start from a routine (targets pre-filled) or an empty
  workout; log weight, reps, and optional partial reps per set; attach a note
  to any exercise; a rest-timer countdown runs between sets and can be
  disabled. Finishing saves the entire session atomically with its
  timestamps.
- **Personal records** - MAX_WEIGHT (heaviest weight for at least one full
  rep) and MAX_REPS (most full reps in a set) are detected automatically
  inside the save transaction; new records are reported back immediately.
- **Analytics** - training volume by day or week and by muscle group,
  per-exercise progression (max weight or volume over time), a training
  summary, and a paginated workout history with a full detail view.

## Prerequisites

- Node.js 18 or newer
- MySQL 8.x

## Setup

1. **Database** - create the schema, then load the exercise catalog:

       mysql -u root -p < database/schema.sql
       mysql -u root -p < database/seed.sql

2. **Server configuration**:

       cd server
       cp .env.example .env
       # edit .env: DB credentials + a long random JWT_SECRET, e.g.
       # node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

3. **Install everything** (from the repository root):

       npm run install:all

4. **Run** (two terminals, from the repository root):

       npm run dev:server     # Express API on http://localhost:3000
       npm run dev:client     # Vite dev server on http://localhost:5173

5. Open <http://localhost:5173>, create an account, and start logging.
   The Vite dev server proxies /api to the backend, so the client uses
   relative URLs and no base-URL configuration is needed. The proxy makes
   every request same-origin, so CORS is not involved in this setup; the
   API enables CORS middleware anyway so it can be called from a client served
   on a different origin.

## Project structure

    fitness-platform/
    |-- client/                          # React frontend (Vite)
    |   |-- index.html                   # entry document, fonts
    |   |-- vite.config.js               # dev server + /api proxy to :3000
    |   `-- src/
    |       |-- main.jsx                 # React root
    |       |-- App.jsx                  # routes (public + protected)
    |       |-- styles.css               # design tokens + all styling
    |       |-- api/client.js            # Axios instance, JWT interceptors
    |       |-- context/AuthContext.jsx  # session state and persistence
    |       |-- components/              # BrandMark, Layout, ProtectedRoute
    |       `-- pages/                   # Login, Register, Dashboard, Catalog,
    |                                    # Routines, RoutineBuilder, WorkoutStart,
    |                                    # LiveWorkout, History, WorkoutDetail
    |-- server/                          # Express REST API
    |   |-- .env.example                 # DB credentials + JWT settings
    |   `-- src/
    |       |-- server.js                # entry point, env checks
    |       |-- app.js                   # middleware, route mounting, errors
    |       |-- config/db.js             # mysql2 pool (named placeholders)
    |       |-- middleware/auth.js       # JWT verification
    |       |-- controllers/             # auth, users, exercises, routines,
    |       |                            # workouts, records, analytics
    |       |-- services/                # exercise visibility, PR detection
    |       `-- routes/                  # one router per resource
    |-- database/
    |   |-- schema.sql                   # 9 tables, FKs, CHECK constraints
    |   `-- seed.sql                     # built-in exercise catalog
    |-- package.json                     # root convenience scripts
    `-- README.md

## API overview

All routes live under `/api`. Except registration, login, and the health
check, every route requires `Authorization: Bearer <token>`.

    POST /auth/register            POST /auth/login
    GET  /users/me
    PUT  /users/me # is functional but has no client UI in this version
    GET  /exercises                POST /exercises        DELETE /exercises/:id
    GET  /routines                 POST /routines
    GET  /routines/:id             PUT  /routines/:id     DELETE /routines/:id
    PUT  /routines/:id/schedule    GET  /routines/schedule
    GET  /workouts                 POST /workouts
    GET  /workouts/:id             DELETE /workouts/:id
    GET  /records
    GET  /analytics/summary        GET  /analytics/volume
    GET  /analytics/volume-by-muscle
    GET  /analytics/progression/:exerciseId
    GET  /health

## Design notes

- **One volume formula everywhere.** Volume is weight x reps summed over
  sets; partial reps are logged but never counted. The history feed, the
  detail view, and every analytics endpoint share this rule, so no two
  screens disagree.
- **Batch save.** The client owns the in-progress workout; finishing sends
  the whole payload in one transaction across three tables, and personal
  record detection runs inside that same transaction.
- **Deletion semantics.** A user's data cascades with them; deleting a
  routine keeps workout history (`SET NULL`); deleting a workout keeps
  record values (`SET NULL` on the achieving set).
- **Deleting an exercise.** A custom exercise is removed from any routine
  that prescribes it (`CASCADE`) - a routine is an editable plan, so this is
  intentional. It cannot be deleted at all once it appears in logged history
  or a personal record (`RESTRICT`), because those record what was actually
  lifted.
- **Parameterized SQL only.** Every query uses named placeholders; the few
  dynamic SQL fragments (column whitelists, generated `IN` placeholders,
  clamped LIMIT integers) never contain user input.
- **Security basics.** Passwords stored as bcrypt hashes; identical 401s
  prevent email enumeration; the server refuses to boot without a real
  `JWT_SECRET`; `.env` is git-ignored.
