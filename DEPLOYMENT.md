# Deployment plan: Vercel (frontend) + Render (backend)

Status: drafted by QA/deploy after exercising all 9 documented API endpoints
locally against the real Neon database (see "QA results" below). Nothing in
`api/` or `frontend/` was modified to produce this document — any bug found
is called out for the owning teammate to fix.

## 1. Backend on Render (`api/`)

### Service type
Render **Web Service**, not a static site or background worker — it needs to
stay running to serve requests.

### Root/working directory: the repo root, not `api/`
`api/main.py` does `from db import get_connection` and `from logger import
logger` as plain top-level imports — those modules live at the repo root,
not inside `api/`. Render's build/start commands must run with the **repo
root as the working directory** (Render's default "Root Directory" setting
should be left blank/`.`, not set to `api`), otherwise both imports fail at
startup.

### Build command
```
pip install -r api/requirements.txt
```
`api/requirements.txt` already duplicates `psycopg2-binary` and
`python-dotenv` alongside `fastapi`/`uvicorn` (with a comment explaining
why), specifically so this one install command is self-sufficient — it does
not also need the root `requirements.txt`. Confirmed by reading the file
during this session.

### Start command
```
uvicorn api.main:app --host 0.0.0.0 --port $PORT
```
`--host 0.0.0.0` is required — Render's health checker and edge proxy can't
reach a server bound to `127.0.0.1`. `$PORT` is injected by Render; do not
hardcode 8000.

### Health check
`GET /health` exists in the current `api/main.py` (added mid-session by the
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
| `NEON_DATABASE_URL` | the same Neon connection string already used by the GitHub Actions fetch job (stored there as a repo secret) | `.env` is gitignored and never committed — copy the value manually into Render's env var UI. |
| `ALLOWED_ORIGINS` | the deployed Vercel URL(s), comma-separated, e.g. `https://f1-tracker.vercel.app` | Read by `api/main.py` (`os.environ.get("ALLOWED_ORIGINS", "")`) and appended to the CORS allow-list alongside the hardcoded `localhost:5173`/`127.0.0.1:5173` dev origins. **Without this set, the deployed frontend's API calls will fail CORS** — this is the one deploy-config step most likely to be forgotten, since it works fine locally with no env var at all. Set it to the production Vercel domain; preview-deploy subdomains are covered separately by `allow_origin_regex` (see §3) and don't need to be listed here. |

No `render.yaml` exists yet. One isn't strictly required — the above build
command / start command / health check path / env vars can all be entered
directly in the Render dashboard when creating the Web Service. A
`render.yaml` is worth adding later only if the owner wants the service
config checked into source control (infra-as-code), not a blocker for a
first deploy.

### Python version
The GitHub Actions fetch workflow (`.github/workflows/fetch.yml`) pins
`python-version: "3.14"`. Set the same on Render (env var `PYTHON_VERSION=3.14`
or a `runtime.txt` containing `3.14`, per Render's Python docs) so behavior
matches what's already tested in CI.

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

`api/main.py`'s CORS middleware uses an exact-match allow-list plus a regex
for Vercel preview subdomains:
```python
allow_origins=_default_origins + _extra_origins,
allow_origin_regex=r"https://f1-tracker-[a-z0-9-]+\.vercel\.app",
```
An origin is allowed if it matches either. Practical implications:
- The Vercel **production** URL must still be added to `ALLOWED_ORIGINS`
  exactly (scheme + host, no trailing slash, e.g.
  `https://f1-tracker.vercel.app`). The regex does not cover the bare prod
  host (no dash after the `f1-tracker` slug), so prod stays an explicit
  env-var step.
- Vercel **preview deployments** (`f1-tracker-git-<branch>-<user>.vercel.app`
  or a hash-based `f1-tracker-<hash>-<user>.vercel.app`) are now matched
  automatically by the regex — no per-deploy `ALLOWED_ORIGINS` entry needed.
  The pattern is anchored to the `f1-tracker-` project slug; if the Vercel
  project slug changes, update the regex.
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

### Gaps closed mid-session (not by me — `api/main.py` was edited live by the
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

### Remaining pre-deploy checklist
- [ ] Set `NEON_DATABASE_URL` in Render's environment (copy from local `.env` or the GitHub Actions secret — don't commit it).
- [ ] Set `ALLOWED_ORIGINS` in Render to the production Vercel URL once it's known (chicken-and-egg: deploy backend first, get its URL, set `VITE_API_URL` in Vercel, deploy frontend, get its URL, set `ALLOWED_ORIGINS` in Render, redeploy backend or just update the env var — Render redeploys automatically on env var change).
- [ ] Set `VITE_API_URL` in Vercel to the production Render URL.
- [ ] Verify `GET /health` returns `200 {"status":"ok"}` against a freshly-restarted server (the process running locally during this QA pass predates the `/health` addition and returned a stale `404` — not a real bug, just needs a restart to confirm).
- [x] Preview-deployment CORS resolved: `api/main.py` now matches Vercel preview subdomains via `allow_origin_regex` (see §3), so previews can reach the live API without per-deploy config.
- [ ] Pin the Python runtime version on Render to match CI (`3.14`, per `.github/workflows/fetch.yml`).
