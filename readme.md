# F1 Tracker

Personal project for hands-on practice with REST API integration, retry/backoff
handling, idempotent database upserts, structured logging, containerized
storage, and CI scheduling — using real F1 lap timing data.

## What it does

Pulls lap-by-lap timing data for every driver across four teams (Ferrari,
Mercedes, McLaren, Red Bull) from the [OpenF1 API](https://openf1.org/) for
each completed race weekend, persists it to Postgres, and serves it through
a read-only dashboard for head-to-head comparison between any two drivers on
the tracked teams.

## Project structure

All Python lives under `backend/`, mirroring `frontend/`. Every command runs
from the repo root (that's where `venv/` and `.env` live), using
`py -m backend.<package>.<module>` so the `backend.*` imports resolve.

- **`backend/api/`** — read-only FastAPI layer over Postgres (Part 6). It
  never calls OpenF1 itself — it only serves what the fetch pipeline already
  persisted, so it's immune to rate limits and the live-session lockout.
- **`backend/pipeline/`** — the scheduled fetch job:
  - `fetch_laps.py` — domain layer. Which session to pull, which drivers we
    care about (resolved per-session via `/drivers`, not hardcoded), and
    what to do with the data.
  - `backfill.py` — same pipeline, run once per completed race of a season.
  - `store.py` — the write path: one idempotent upsert per table. Knows
    about the schema; doesn't know anything about HTTP.
- **`backend/shared/`** — code both sides import:
  - `openf1_client.py` — transport layer. Request pacing and retry/backoff
    for talking to OpenF1 safely. Has no idea what a "lap" or "driver" is.
  - `openf1_endpoints.py` — endpoint layer. One thin wrapper per OpenF1
    endpoint; knows URLs and query params, makes no domain decisions and
    does no persistence. Every wrapper goes through `request_with_retry` —
    nothing here calls `requests` directly.
  - `db.py` — Postgres connection handling (credentials from `.env`).
  - `logger.py` — the one shared logger instance.
  - `next_race.py` — soonest upcoming session (used by `/api/next-race`).
  - `jolpica_client.py` — transport layer for the [Jolpica F1
    API](https://github.com/jolpica/jolpica-f1) (a free, unauthenticated,
    Ergast-schema-compatible season/standings/results API), paced under its
    published rate limit. Same job as `openf1_client.py`, for a different API.
  - `jolpica_lookup.py` — season schedule + round lookups against Jolpica.
  - `jolpica_results.py` — official race/qualifying result parsing.
  - `race_weekend.py` — builds the aggregate race-weekend payload (next
    race, weekend session times, last year's winner at that circuit, a
    recap of the most recently completed race, top-5 standings) from
    Jolpica, independent of OpenF1.
- **`backend/tools/`** — local one-off DB utilities (untracked).
- **`backend/schema.sql`** — table definitions.
- **`frontend/`** — the Part 6 dashboard: a scroll-spy navbar layout
  (Overview / Race Weekend / Standings / Race Analysis / About, hash-synced,
  no router) built with Vite + React + TypeScript. Recharts for the 2D
  charts, react-three-fiber for the 3D lap-time hero, Framer Motion for
  transitions. A team switcher picks any head-to-head pair across the four
  tracked teams; `theme.ts` retints the whole page — charts included — to
  the selected pair's validated colors. Race Weekend and Standings are
  Jolpica-backed (schedule, circuit, standings, historical results); the
  rest of the dashboard stays OpenF1-backed (lap times, telemetry).
- **`dev.ps1`** — starts API + frontend, one terminal window each.

## Status

- [x] **part 1** — fetch-only script (`fetch_laps.py`), no DB. Pulls and
      prints lap data for both drivers from the latest completed race session.
- [x] **part 2** — retry/backoff for the API's 3 req/sec rate
      limit, proper exception handling (retryable vs. non-retryable
      failures), and proactive request pacing.
- [x] **part 3** — Postgres via Docker Compose. Schema for races/drivers/laps.
      Idempotent upserts (`ON CONFLICT ... DO UPDATE`) so re-running a race
      doesn't duplicate rows. Credentials in `.env`, never hardcoded.
- [x] **part 4** — structured logging via the `logging` module (what ran,
      when, what was pulled, what failed) instead of print statements.
- [x] **part 5** — GitHub Actions scheduling (Monday + Thursday), migrating
      the database from local Docker Compose to a managed cloud Postgres
      instance (Neon) so a scheduled job has something to actually connect
      to, plus a schema expansion (stints, pit stops, weather, lap-by-lap
      position, race control messages) ahead of Part 6.
- [ ] **part 6** — read-only dashboard over Part 5's data: a FastAPI JSON
      layer (`api/`) plus a React frontend (`frontend/`) with lap time
      trends, per-lap teammate delta, tire strategy, pit stops, track
      position, weather, and the race control feed. Since the initial build:
      a full visual redesign (sidebar shell → scroll-spy navbar, "liquid
      glass" surfaces), a 4-team head-to-head pair switcher with validated
      per-team palettes, a performance pass (route-scoped code-splitting,
      gzip/cache headers, a scroll-jank fix), and an app-wide Jolpica F1
      integration adding Race Weekend (schedule, circuit, last-year winner,
      recap) and Standings pages alongside the existing OpenF1-backed views.
      Built and running locally; deploying it (Vercel + Render) is the
      remaining step.

This is a skill-building project, not a finished product.

## Design decisions so far

**Filter for completed races, not just scheduled ones.**
OpenF1's `/sessions` endpoint returns _future_ scheduled races too. Taking the
max `date_start` without filtering grabs the next upcoming race instead of
the most recent finished one — filtering by `date_end < now` first is
required to get a race that's actually happened.

**Retry/backoff distinguishes failure types.**
A 429 or 5xx response is retried with exponential backoff + jitter, since
those are transient (rate limit hit, server hiccup). A 4xx like 400 or 404 is
_not_ retried — that means the request itself was malformed, and retrying it
just burns through the rate-limit budget for no benefit.

**Request pacing, not just reactive retries.**
Calls are proactively spaced rather than only backing off after a 429 —
OpenF1's free tier allows 3 req/sec, so waiting for a rejection before
slowing down means a call has already been wasted (and risks compounding
across multiple drivers' requests in the same run).

**Transport split from domain logic.**
Pacing/retry (`openf1_client.py`) moved out of `fetch_laps.py` once more
endpoints (pit stops, stints) were on the way. Without the split, one file
would end up mixing HTTP plumbing, endpoint-specific calls, and database
writes — harder to test and easy to break unrelated things while editing.
The client has zero opinions about laps/drivers; it just does "GET this
URL safely."

**Composite primary key on `laps`, not an auto-incrementing id.**
`(session_key, driver_number, lap_number)` together _are_ the identity of a
lap — there's no other sensible definition of "the same lap" across reruns.
An auto-incrementing `id` would have no way to recognize "I've already seen
this lap" on a second run, so every rerun would insert duplicates instead of
updating in place. The composite key is what makes `ON CONFLICT ... DO
UPDATE` actually idempotent rather than just syntactically present.

**Dropped the per-driver sector segment arrays (`segments_sector_1/2/3`).**
OpenF1 returns these as arrays of mini-sector color codes. Flattening an
array into a relational column means either a JSON column or a separate
child table — both add real complexity for data that doesn't serve the
project's actual goal (comparing lap times between two drivers). Left out
deliberately, not missed by accident.

**One `cur.execute()` per lap, not a bulk insert.**
At ~70 laps × 2 drivers per run, the overhead of bulk insert helpers
(`execute_values` etc.) isn't worth the added complexity yet. Worth
revisiting if the project ever pulls a full season instead of one race.

**Structured logging via a shared `logger.py`, not per-file `getLogger()` calls.**
All four files import the same `logger` instance from `logger.py`. That
means format, level, and handler configuration live in exactly one place —
changing the log format or adding a file handler later is a one-line edit,
not a hunt across every module. Log levels follow standard conventions:
`INFO` for the happy path (run started, laps upserted), `WARNING` for
recoverable surprises (malformed date in API response), `DEBUG` for
internal plumbing that's useful when debugging but noise otherwise (retry
delays, individual DB upsert confirmations).

**Managed Postgres (Neon) instead of local Docker Compose, for Part 5.**
GitHub Actions runners are ephemeral cloud VMs with no route to a home
network — a scheduled cloud job can't reach a Postgres container running
on a local machine. Neon was chosen over Supabase and Railway: it's plain
Postgres with no bundled auth/storage this project doesn't need, and its
scale-to-zero free tier fits a job that only writes twice a week — no
idle-pause risk like Supabase's weekly timeout, no always-on billing like
Railway's default. Free tier limits (500 MB storage, 100 CU-hrs/month)
leave comfortable headroom even scaled up to a full 22-driver grid.

**Twice-weekly schedule (Monday + Thursday), not once.**
Monday is the primary run — a race weekend wraps by Sunday, so that's when
new completed-race data is actually available. Thursday is redundancy: with
idempotent upserts, re-running against an already-fetched race is a no-op,
so it costs nothing and catches a silently failed Monday run before the
next race weekend.

**Data model expanded beyond laps, ahead of Part 6.**
`stints` (tire compound/age), `pit` (stop duration/lap), `weather`
(track/air temp, humidity, rainfall), `positions` (lap-by-lap position
changes), and `race_control` (flags, safety car, penalties) were added to
the schema before frontend work starts — these produce genuinely different
chart types (tire strategy strips, position line charts, pit stop
comparisons) instead of just more rows in a lap-time table. `car_data` and
`location` (high-frequency telemetry, many samples per second) are
explicitly excluded — orders of magnitude more volume than everything else
combined, and not needed at race-weekend granularity.

**`race_control` is insert-only, not upserted.**
Unlike a lap time, a race control message is an append-only event — it
never gets corrected after the fact, so there's no "same row, updated" case
the way there is for laps or stints. Simpler to insert without an
`ON CONFLICT` clause and rely on a higher-level check than to force a
synthetic key onto data that doesn't need one. The check is
`race_control_already_fetched()` in `backend/pipeline/store.py`: `main()` calls it before
fetching and skips the endpoint entirely if the session's messages are
already in the table — otherwise the Thursday redundancy run would
duplicate every row.

**Red-flag outliers are blanked from charts, never from data (Part 6).**
A red-flag stoppage records one absurd "lap" (30+ minutes at Monaco) and one
absurd "pit stop" (the car sitting out the stoppage), and a single such value
flattens every real lap against the axis. The charts drop laps over 3× the
median and stops over 180s so the actual racing story stays readable — but
only in the chart layer: the values remain untouched in the database, the
API response, and each chart's table view, and the chart subtitle says when
something was left off.

**4-team pair model instead of a fixed Hamilton/Leclerc comparison.**
The pipeline expanded to track every driver across four teams (Ferrari,
Mercedes, McLaren, Red Bull) instead of two hardcoded drivers, and the
frontend gained a team switcher so any two drivers on a tracked team can be
compared head-to-head. Each team's accent and driver-slot colors are run
through a contrast validator rather than picked by eye, so a colorblind-
readability regression fails loudly instead of shipping unnoticed — the one
known ambiguity found this way (Ferrari's giallo accent vs. McLaren's papaya,
too close for deuteranopia) is tracked deliberately rather than silently
accepted.

**Countdown falls back to a disk-persisted cache, not just an in-process one.**
`/api/next-race` is the one documented exception to "the API never calls
OpenF1 itself" — the `races` table only ever has completed sessions, so
finding the *next* one means a live call. OpenF1's free tier blocks *all*
unauthenticated requests while any session anywhere is live, which would
otherwise blank the countdown for an entire race weekend. The last good
payload is persisted to disk, not just kept in memory, so a process restart
mid-lockout (a redeploy, `--reload` picking up a save) still has a fallback
to serve instead of `null`.

**Backdrop-filter over anything animated forces a permanent re-blur — never animate under glass.**
The redesign's first real performance bug came from this: the page
background ("aurora") originally used three `filter: blur(110px)` blobs on
infinite drift keyframes, sitting under roughly a dozen `backdrop-filter`
glass surfaces. Anything animating beneath a backdrop-filter surface forces
it to recompute the blur every frame, forever — regardless of how cheap the
animation itself is. Fixed by making the aurora a static layer: solid themed
fills shaped by a `mask-image` radial gradient instead of `filter: blur()`,
so only the 250ms retint crossfade animates. The same root cause resurfaced
later, scoped to Race Analysis's chart cards specifically — see the
scroll-jank entry below.

**Custom accessible listbox instead of the native `<select>`.**
The native dropdown's popup styling is controlled by the OS/browser, not
CSS — it rendered a white menu in dark mode despite the page correctly
setting `color-scheme`. Replaced with a WAI-ARIA listbox component
(`GlassSelect.tsx`): trigger `aria-expanded`, `aria-activedescendant`,
arrow-key navigation that skips disabled options, and close on
`Escape`/`Tab`/outside-click — while still rendering as part of the same
glass design system as everything else on the page.

**Route-scoped code-splitting via `React.lazy`, not `vite.config.ts` manual chunks.**
The dashboard's three views each pull in different heavy dependencies — `three.js` /
`react-three-fiber` / `drei` for the Overview hero, `recharts` for the six Race Analysis
charts — but every component was a static import, so all three shipped in one bundle
regardless of which view a visitor landed on. Wrapping the already-existing
`view === "..."` conditionals in `React.lazy()` + `Suspense` splits each cluster into
its own chunk automatically (confirmed via `npm run build`: a ~905KB three.js/r3f/drei
chunk and separate recharts chunks, apart from the ~355KB main bundle) — no
`manualChunks` config needed, since Vite already splits on `import()` boundaries.

**Cache-Control + gzip on backend responses, only where data is provably immutable.**
Every `/api/races/{session_key}/...` endpoint serves data the fetch pipeline already
backfilled — it never changes once written. `GZipMiddleware` plus a
`Cache-Control: public, max-age=3600` header were added to those six endpoints, but
deliberately not to `/health` or `/api/next-race`, which are live/uncached by design.

**Race Analysis scroll jank root-caused to `backdrop-filter`, not JS.**
The page stacks 6-7 frosted `.glass` chart cards; scrolling re-blurs whatever's moving
underneath each one, every frame. Measured with a `requestAnimationFrame`-delta +
`PerformanceObserver('longtask')` harness before touching anything: 18 frames over 33ms
per fast-scroll pass and zero main-thread long tasks, confirming pure GPU compositor
cost, not a JS bottleneck — then confirmed the cause via A/B (backdrop-filter stripped
with injected CSS), which dropped the stutter to zero. Fix: Race Analysis's `ChartCard`s
use a solid, non-blurred fill (`card--solid`) instead of the shared `.glass` recipe —
same border/shadow language, no `backdrop-filter` — while the sidebar and Overview keep
the full frosted treatment.

**Jolpica F1 (Ergast-schema) added alongside OpenF1, not instead of it.**
OpenF1 has no concept of season schedules, standings, or historical
results — it's a live/session-timing API. Race Weekend and Standings need
exactly those concepts, so `race_weekend.py` calls the free
[Jolpica F1 API](https://github.com/jolpica/jolpica-f1) directly, deliberately
independent of `next_race.py`/OpenF1: it finds "the next race" itself by
scanning the season schedule for the soonest date >= now, rather than
depending on OpenF1 being reachable or trusting an undocumented Ergast
round-selector keyword. Unlike OpenF1, an empty Jolpica result is a `200`
with an empty array, never a `404` — so `jolpica_client.py` has no
"no results" special case, only real transport/server errors.

**Three different cache shapes for three different kinds of Jolpica data.**
All three follow the same disk-persisted, never-5xx pattern as
`/api/next-race`'s countdown cache, but the TTL differs by how often the
underlying data can actually change: `/api/race-weekend` and `/api/standings`
get a 6-hour TTL (schedule/circuit/standings move at most weekly);
`/api/races/{session_key}/official-result` gets no TTL at all, because a
finished race's result is immutable forever and re-fetching it on a timer
would just be wasted requests against the rate limit.

**Circuit card is an empty placeholder frame, not a map or image.**
`CircuitImage.tsx` originally rendered a lat/long pin map; that was dropped
in favor of a plain framed placeholder plus the circuit name/location and a
"who won here last year" footnote. Simpler, doesn't depend on a mapping
library or circuit imagery that Jolpica doesn't provide, and keeps the
card's real job (circuit identity + last-year context) front and center.

## Known data quirks (not bugs)

- **Empty result sets arrive as 404, and entire races can be missing.**
  OpenF1 returns `404 {"detail": "No results found."}` instead of `200 []`
  when a query matches nothing. `request_with_retry` recognizes exactly that
  response and returns an empty list, so "no data" flows through the pipeline
  as zero rows instead of an exception (any other 404 still raises). And the
  gap can be total: the 2026 Bahrain GP (session_key 11261) has a driver
  roster on OpenF1 but no laps, stints, pit, weather, positions, or race
  control data at all — discovered when it aborted the first season backfill.
- Lap counts can legitimately differ between drivers in the same session — a
  DNF, retirement, or red flag means fewer laps for one driver. This needs
  intentional handling downstream (e.g. when comparing two drivers), not a
  fix to the fetch logic itself.
- **Global live-session lockout (free tier).** While _any_ F1 session is
  live — from ~30 min before it starts to ~30 min after it ends — OpenF1
  blocks **all** unauthenticated requests, not just requests for that
  session's data. A `/sessions` query asking only for fully historical
  races still gets a 401 if some unrelated session elsewhere on the
  calendar happens to be live at request time. Filtering by `date_end < now`
  in the query params doesn't avoid this — the lockout is enforced before
  any server-side filtering happens. On the free tier, there's no
  workaround; you wait for the live window to close. Confirmed live during
  the 2026 Austrian GP (June 28).

## Running it

### The dashboard (the thing you usually want)

One command, from the repo root:

```powershell
.\dev.ps1
```

That opens two terminal windows — the API on http://localhost:8000 and the
frontend on http://localhost:5173 — then open http://localhost:5173.

**To restart either one:** close its window (or Ctrl+C inside it) and rerun
`.\dev.ps1`. The API runs with `--reload`, so most backend code edits
restart it automatically without you doing anything.

The raw commands, if you'd rather run them yourself (both from the repo
root; first-time installs commented):

```powershell
# .\venv\Scripts\python.exe -m pip install -r backend\api\requirements.txt
.\venv\Scripts\python.exe -m uvicorn backend.api.main:app --reload --reload-dir backend
```

```powershell
cd frontend
# npm install
npm run dev
```

The frontend expects the API on `http://localhost:8000` (override with
`VITE_API_URL`, see `frontend/.env.example`), and the API's CORS only
allows the frontend on port 5173 — if Vite says it picked another port,
some other dev server is already running; close it first. The API's
dependencies live in `backend/api/requirements.txt`, separate from
`backend/requirements.txt`, so the scheduled GitHub Actions fetch job
doesn't install a web framework it never uses. First load after the
database has been idle can take a few seconds — Neon's free tier scales to
zero and cold-starts on the first connection.

### The fetch pipeline (what the GitHub Actions cron runs)

```powershell
.\venv\Scripts\python.exe -m backend.pipeline.fetch_laps    # latest completed race
.\venv\Scripts\python.exe -m backend.pipeline.backfill      # every completed race this season
```

## Local Development Setup

### Why a virtual environment (venv)?

Without one, every Python package you install goes into a single global
location shared by _every_ project on your machine. That becomes a problem
the moment two projects need different versions of the same package —
installing a newer version for one can silently break the other.

A venv is a self-contained folder (the `venv/` directory in this repo) that
holds its own private Python interpreter and its own private set of
installed packages. Activating it points `pip install` and `py` at that
private copy instead of the system-wide one, keeping this project's
dependencies fully isolated.

To activate (PowerShell):

```powershell
.\venv\Scripts\Activate.ps1
```

You'll know it worked when your prompt shows `(venv)` at the start.

### Database setup (Postgres via Docker Compose)

1. Copy `.env.example` to `.env` and fill in real values (never committed —
   `.env` is gitignored).
2. Start the container:

```bash
   docker compose up -d
```

3. Apply the schema (first time only):

```powershell
   Get-Content backend\schema.sql -Raw | docker exec -i f1_tracker_db psql -U f1user -d f1tracker
```

(PowerShell's `<` redirection operator is reserved/unsupported — piping
via `Get-Content` is the workaround. Git Bash supports `<` natively if
you'd rather use that.)

### Why port 5432?

5432 is Postgres's registered default port — the same way 443 is HTTPS's
default. It's not configurable inside the Docker image without overriding
it; Postgres listens on 5432 _inside the container_ by convention.

What's configurable is the **host-side** port — the one your local script
actually connects to. In `docker-compose.yml`, the mapping is written as
`"host_port:container_port"`, e.g. `"5432:5432"`. The right-hand side stays
5432 (Postgres's internal port); the left-hand side is yours to change —
for example, to `"5433:5432"` if you already have a native Postgres
install on Windows occupying 5432.

(Windows: use `py`, not `python` — avoids the Windows Store alias issue.)

## Stack

- Python + `requests` — OpenF1 REST API client (`backend/shared/openf1_client.py`)
- Python + `requests` — Jolpica F1 (Ergast-schema) API client (`backend/shared/jolpica_client.py`)
- `psycopg2` + Postgres — persistence (`backend/pipeline/store.py`, `backend/schema.sql`)
- Neon — managed Postgres, reachable by scheduled cloud runs (Part 5)
- GitHub Actions — scheduling (Part 5)
- FastAPI + uvicorn — read-only JSON API over the database, plus live-cached
  OpenF1/Jolpica passthrough endpoints (Part 6, `backend/api/`)
- Vite + React + TypeScript — dashboard frontend (Part 6, `frontend/`)
- Recharts (2D charts) · react-three-fiber/three.js (3D hero) · Framer Motion (transitions)

---
