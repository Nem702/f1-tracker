# Deployment plan: Vercel (frontend) + Render (backend)

Status: drafted by QA/deploy after exercising all 9 documented API endpoints
locally against the real Neon database (see "QA results" below). Nothing in
`api/` or `frontend/` was modified to produce this document — any bug found
is called out for the owning teammate to fix.

## 1. Backend on Render (`backend/api/`)

### Service type
Render **Web Service**, not a static site or background worker — it needs to
stay running to serve requests.

### Root/working directory: the repo root, not `backend/`
`backend/api/main.py` imports its siblings absolutely (`from
backend.shared.db import get_connection` etc.), so the `backend` package
must be importable from the working directory. Render's build/start
commands must run with the **repo root as the working directory** (Render's
default "Root Directory" setting should be left blank/`.`, not set to
`backend`), otherwise the `backend.*` imports fail at startup.

### Build command
```
pip install -r backend/api/requirements.txt
```
`backend/api/requirements.txt` already duplicates `psycopg2-binary` and
`python-dotenv` alongside `fastapi`/`uvicorn` (with a comment explaining
why), specifically so this one install command is self-sufficient — it does
not also need the pipeline's `backend/requirements.txt`. Confirmed by
reading the file during this session.

### Start command
```
uvicorn backend.api.main:app --host 0.0.0.0 --port $PORT
```
`--host 0.0.0.0` is required — Render's health checker and edge proxy can't
reach a server bound to `127.0.0.1`. `$PORT` is injected by Render; do not
hardcode 8000.

### Health check
`GET /health` exists in the current `backend/api/main.py` (added mid-session by the
backend teammate) and deliberately does **not** touch the database — it just
returns `{"status": "ok"}`. That's the right choice for Render's health
check path: Neon's free tier scales to zero and cold-starts on first
connection (can take a few seconds), so a health check that queries the DB
would flap the service unhealthy right after a deploy or any idle period.
Set Render's health check path to `/health`.

Caveat found during QA: the locally-running dev server (started without
`--reload`) was still serving the pre-`/health` code and 404'd on
`GET /health` — a stale-process issue, not a code bug. Whoever restarts the
API before deploying should re-verify `/health` returns 200 first.

### Environment variables (Render dashboard → Environment)
| Variable | Value | Notes |
|---|---|---|
| `NEON_DATABASE_URL_RO` | the connection string for the read-only Neon role — see "Neon read-only role" below | **Required.** The API connects as a role with SELECT and nothing else, so a compromise of the public-facing service can't write to the database. Without this var the service still starts and `/health` still returns 200 (it never touches the DB), but *every* DB-backed endpoint returns `503 {"detail": "Database unavailable"}` with a `KeyError: 'NEON_DATABASE_URL_RO'` traceback in Render's logs. Worth knowing, because a 503 from this API otherwise reads as a Neon cold start. There is deliberately no fallback to `NEON_DATABASE_URL`. |
| `NEON_DATABASE_URL` | ~~read-write connection string~~ — **no longer read by the API** | Nothing under `backend/api/` calls the read-write connection any more (`get_db()` uses `get_readonly_connection()`). It remains required as the **GitHub Actions repo secret** for the fetch pipeline (`.github/workflows/fetch.yml`) — that is a separate store and is unaffected. Delete it from *Render* once the read-only role is verified; see the ordering below. |
| `ALLOWED_ORIGINS` | the deployed frontend origin(s), comma-separated — currently `https://f1-tracker.dev` | Read by `backend/api/main.py` (`os.environ.get("ALLOWED_ORIGINS", "")`) and used as the CORS allow-list. **This is the whole allow-list in production** — nothing else is allowed implicitly (see §3), so without it every browser request fails CORS. The API logs a warning at startup when the resolved list is empty, so a forgotten value shows up in Render's log tab rather than only in a visitor's console. |
| `ALLOW_DEV_ORIGINS` | leave **unset** on Render | Local dev only: when set to `1`/`true`/`yes` (case-insensitive) the API also allows `http://localhost:5173` and `http://127.0.0.1:5173`. Anything else — including unset — leaves them out, so the gate fails closed. `dev.ps1` sets it for the local API window. |

### Neon read-only role for the API

The API is read-only by design — every endpoint is a `SELECT` — but until this
change it connected with the same read-write credentials as the fetch
pipeline, so the public-facing service held write access it never used. It now
connects as a dedicated role that Postgres will not let write at all.

> ⚠️ **Create the role with SQL in the Neon SQL Editor — not the Console's
> Roles UI / "New Role" button.** Roles created via the Neon Console, CLI, or
> API are granted membership in `neon_superuser`, which confers CREATEDB,
> CREATEROLE, BYPASSRLS, and read *and write* on every table, view, and
> sequence. Clicking "New Role" produces a read-write role wearing a read-only
> name, and silently defeats this entire change. Roles created with SQL get
> only the default privileges of a new role in a standalone Postgres install.

Run as the role in `NEON_DATABASE_URL` (the table owner, e.g. `neondb_owner`).
Neon requires the password to be 12+ characters with mixed case, a number, and
a symbol. Substitute the real database and owner names.

```sql
CREATE ROLE f1_api_ro WITH LOGIN PASSWORD '<generate-a-strong-one>';
GRANT CONNECT ON DATABASE neondb TO f1_api_ro;
GRANT pg_read_all_data TO f1_api_ro;
```

`pg_read_all_data` is a predefined Postgres role conferring SELECT on all
tables, views, and sequences plus USAGE on all schemas. It's evaluated at
query time, so tables added to `backend/schema.sql` later are covered
automatically with no follow-up grant.

**Fallback, if that last statement returns `permission denied to grant role`.**
Postgres 16 changed `CREATEROLE` so it no longer implies the ability to grant
arbitrary predefined roles — you need ADMIN OPTION on the specific role, and a
`CREATEROLE` user gets that automatically only for roles it creates itself, not
for built-ins. Neon's docs list `neon_superuser` as a *member* of
`pg_read_all_data` but note `WITH ADMIN OPTION` only for `pg_monitor` and
`pg_signal_backend`. Whether the grant works is project-specific; the one
statement tells you. If it's refused:

```sql
GRANT USAGE ON SCHEMA public TO f1_api_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO f1_api_ro;
-- FOR ROLE is load-bearing. Default privileges attach to the CREATING role,
-- and without it they'd attach to whoever ran this statement. The pipeline
-- connects as the owner and is the only thing that ever creates tables, so
-- naming the owner explicitly is what makes future tables readable.
ALTER DEFAULT PRIVILEGES FOR ROLE neondb_owner IN SCHEMA public
  GRANT SELECT ON TABLES TO f1_api_ro;
```

Unlike `pg_read_all_data`, `GRANT SELECT ON ALL TABLES` is a snapshot of the
tables that exist right now — the `ALTER DEFAULT PRIVILEGES` line is what
covers the next one. If that line ever names the wrong owner, everything keeps
working until the pipeline adds a table, and then the API loses access to it
silently.

Sequence write privileges are deliberately not granted: `race_control.id` is a
`SERIAL`, and a read-only API never calls `nextval`.

Do **not** add `ALTER ROLE f1_api_ro SET default_transaction_read_only = on`.
It makes writes fail with SQLSTATE 25006 (read-only transaction) instead of
42501 (insufficient privilege), which masks whether the grants themselves are
actually correct — and the grants are the thing worth being sure about.

### Rollout order

The role must exist and `NEON_DATABASE_URL_RO` must be set **before** the code
change deploys, or the API 503s on every DB-backed endpoint.

1. Create the role with SQL in the Neon SQL Editor (above).
2. Set `NEON_DATABASE_URL_RO` in Render.
3. Deploy the code change.
4. Verify the API serves real data on the read-only connection.
5. Before deleting anything, check Render's **One-Off Jobs** and any cron on
   this service for other references to `NEON_DATABASE_URL`. The fetch
   pipeline runs in GitHub Actions on its own secret, so there shouldn't be
   any — but a job that loses an env var it depends on fails at *run* time,
   not deploy time, so confirm rather than assume.
6. Delete `NEON_DATABASE_URL` from Render. This triggers its own redeploy;
   expect a second cold start, and don't read the brief unavailability as the
   change having broken something.

The rollback window stays open through step 4 and only closes at step 6.

No `render.yaml` exists yet. One isn't strictly required — the above build
command / start command / health check path / env vars can all be entered
directly in the Render dashboard when creating the Web Service. A
`render.yaml` is worth adding later only if the owner wants the service
config checked into source control (infra-as-code), not a blocker for a
first deploy.

### Python version
Confirmed set on Render: `PYTHON_VERSION=3.14`, matching the
`python-version: "3.14"` pin in the GitHub Actions fetch workflow
(`.github/workflows/fetch.yml`), so runtime behavior matches what CI already
tests. (Render also accepts a `runtime.txt` containing `3.14` for this; the env
var is what's in use here.)

## 2. Frontend on Vercel (`frontend/`)

### Project root
Set Vercel's project root directory to `frontend/` (this repo is not a
frontend-only repo, so the default root won't auto-detect the Vite app).

### Build command / output directory
```
npm run build        # runs `tsc -b && vite build` per package.json
```
Output directory: `dist` (Vite's default; a `frontend/dist` from a prior
local build already exists and looks correct — `index.html`, `assets/`,
`favicon.svg`, `icons.svg`). Vercel's Vite framework preset auto-fills both
of these; no `vercel.json` is required for a plain static Vite build.

### Environment variables (Vercel dashboard → Settings → Environment Variables)
| Variable | Value | Notes |
|---|---|---|
| `VITE_API_URL` | the deployed Render URL, e.g. `https://f1-tracker-api.onrender.com` | Read in `frontend/src/api/client.ts`: `import.meta.env.VITE_API_URL ?? "http://localhost:8000"`. Without it, the deployed frontend silently tries to call `localhost:8000` from the visitor's browser, which will just fail — worth double-checking after first deploy since there's no loud error for a missing env var here, just broken data loading. |

Set this for the Production environment at minimum; also set it for Preview
deployments if Vercel preview builds should hit the live API (recommend
pointing previews at the same Render service, since there's only one
backend environment right now).

### Vercel free tier note
Vite's static output deploys fine on Vercel's free/hobby tier with no
additional config.

## 3. CORS: origin matching between the two deployed domains

`backend/api/main.py`'s CORS middleware is an exact-match allow-list and
nothing else:
```python
allow_origins=_allowed_origins,   # ALLOWED_ORIGINS, + localhost iff ALLOW_DEV_ORIGINS
```
Practical implications:
- The **production** origin must be in `ALLOWED_ORIGINS` exactly (scheme +
  host, no trailing slash): `https://f1-tracker.dev`.
- Vercel **preview deployments** are *not* allowed automatically. There used to
  be an `allow_origin_regex` matching `f1-tracker-*.vercel.app`, and it was
  removed on purpose: `*.vercel.app` names are globally unique across every
  Vercel account and the whole project slug is chosen by whoever registers it,
  so any pattern over that domain is claimable by a stranger. Requiring the
  team-scope suffix doesn't fix it either — a project named
  `f1-tracker-<anything>-xct-f1-tracker` produces a matching origin. The data
  here is public and read-only and `allow_credentials` is False, so the
  exposure was small, but an exact list costs nothing to maintain at this size.
- To let one preview hit the live API, add its exact origin to
  `ALLOWED_ORIGINS` in Render (comma-separated), then remove it when done.
  Note this also means `https://f1-tracker-mu.vercel.app` — the old
  `.vercel.app` production alias — is no longer allowed; prod is `f1-tracker.dev`.
- Measured against the deployed service before this change shipped: only
  `https://f1-tracker.dev` came back with an `Access-Control-Allow-Origin`
  header. No `*.vercel.app` origin did, preview-shaped or otherwise — so the
  running build was not applying the regex, and removing it changes nothing
  about what production actually allows today.
- `allow_methods=["GET"]` is correct and intentionally narrow — every
  endpoint in this API is read-only, so there's no need to allow
  POST/PUT/DELETE.

## 4. QA results (endpoints exercised locally against real Neon data)

Ran the API locally (`venv` already has `fastapi`/`uvicorn`/`psycopg2`
installed; a server was already live on `127.0.0.1:8000` against the real
`NEON_DATABASE_URL` from `.env`, so no separate DB setup was needed).

**Happy path** — `session_key=11315` (Austria, most recent race):
- `/api/races` — 10 races returned, newest-first, shape sane.
- `/api/drivers` — `[{driver_number: 16, "Charles LECLERC"}, {driver_number: 44, "Lewis HAMILTON"}]`. Matches the `ferrari_driver_numbers()` name-matching logic in `main.py`.
- `/api/races/11315/laps` — 142 rows, both drivers, sane sector/speed data.
- `/api/races/11315/stints` — 8 rows, compound/lap-range fields populated.
- `/api/races/11315/pit` — 6 rows, durations in a plausible ~20s range.
- `/api/races/11315/positions` — 78 rows.
- `/api/races/11315/weather` — 149 rows, temps/humidity/pressure all plausible for Spielberg.
- `/api/races/11315/race-control` — 213 rows, flag/category/message fields populated.
- `/api/races/11315/delta` — 71 rows; driver numbers 16/44 consistent with `/api/drivers`; sign convention matches the docstring (`h.lap_duration - l.lap_duration`, positive = Leclerc faster) — verified against lap 1 (Hamilton 76.178s, Leclerc 77.07s, delta -0.892, i.e. Hamilton faster that lap, correctly negative).

**Known-empty race** — `session_key=11261` (2026 Bahrain, documented in
`readme.md` as having a driver roster but zero laps/stints/pit/weather/
positions/race-control): every one of the 7 sub-resource endpoints returned
`200 []`. No 500s, no exceptions. This is the exact quirk the readme warns
about and it's handled correctly end-to-end, API layer included.

**Garbage/nonexistent `session_key`** — tried `99999999` (valid int, no
matching race), a non-integer (`abc`), a negative int (`-1`), and an
absurdly oversized int (`99999999999999999999999`, far outside Postgres
`INTEGER` range):
- Nonexistent numeric key → clean `404 {"detail": "Unknown session_key ..."}` on every sub-resource endpoint (the shared `require_race()` check catches it before any sub-resource query runs).
- Non-integer path param → FastAPI's standard `422` with a Pydantic-style validation error body. Correct framework behavior, not something to fix.
- Negative int → `404`, same as any other non-matching key. No special-casing needed.
- Oversized int → `404`, not a `500`. Confirmed the API/`psycopg2` layer doesn't choke on a Python big-int that exceeds Postgres `INTEGER` range — Postgres just finds no match rather than raising an out-of-range error. Good robustness, no action needed.

**No bugs found.** All 9 documented endpoints behave correctly on the happy
path, the documented empty-data quirk, and adversarial `session_key` input.

### Gaps closed mid-session (not by me — `backend/api/main.py` was edited live by the
backend teammate while this QA pass was in progress)
1. `ALLOWED_ORIGINS` env var added for CORS — was previously hardcoded to
   only the two localhost dev origins, which would have hard-blocked the
   deployed frontend.
2. `api/requirements.txt` now duplicates `psycopg2-binary`/`python-dotenv`
   (with a comment explaining why) so `pip install -r api/requirements.txt`
   alone is sufficient on a fresh Render build — previously it only listed
   `fastapi`/`uvicorn`, which would have failed at import time on Render
   since `db.py`/`logger.py` need those two packages too.
3. A DB-independent `GET /health` endpoint was added for Render's health
   check.

### Pre-deploy checklist (all done — the service is live)
- [x] `NEON_DATABASE_URL` set in Render's environment (copied manually; never committed).
- [x] `ALLOWED_ORIGINS` set in Render to `https://f1-tracker.dev` (the live frontend domain). Render redeploys automatically when the value changes, so adding or dropping an origin needs no code deploy.
- [x] `VITE_API_URL` set in Vercel — the deployed bundle calls `https://f1-tracker-api.onrender.com`.
- [x] `GET /health` verified against the deployed service: `200 {"status":"ok"}`.
- [x] Preview-deployment CORS settled — the opposite way round from how it was first solved. The `allow_origin_regex` that auto-matched `f1-tracker-*.vercel.app` previews was removed, because any pattern over `*.vercel.app` is claimable by a stranger (see §3). Previews are not allowed by default; give one a temporary exact `ALLOWED_ORIGINS` entry if it needs the live API.
- [x] Python runtime pinned on Render to match CI: `PYTHON_VERSION=3.14` (per `.github/workflows/fetch.yml`).

### Read-only role rollout (outstanding)
Ordering matters — see "Rollout order" above. Steps 1–2 must happen before the
code change deploys.
- [ ] `f1_api_ro` created **with SQL in the Neon SQL Editor**, not the Console's Roles UI (a Console-created role inherits `neon_superuser` and can write).
- [ ] Record which grant form was accepted: `pg_read_all_data`, or the `GRANT SELECT ON ALL TABLES` + `ALTER DEFAULT PRIVILEGES FOR ROLE` fallback. This determines whether future tables are covered automatically.
- [ ] `NEON_DATABASE_URL_RO` set in Render.
- [ ] Code change deployed; a DB-backed endpoint verified returning real rows on the read-only connection.
- [ ] Render One-Off Jobs / cron checked for any other reference to `NEON_DATABASE_URL`.
- [ ] `NEON_DATABASE_URL` deleted from Render (the GitHub Actions repo secret stays — the fetch pipeline needs it).
