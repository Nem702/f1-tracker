# F1 Tracker

Personal project for hands-on practice with REST API integration, retry/backoff
handling, idempotent database upserts, structured logging, containerized
storage, and CI scheduling — using real F1 lap timing data.

## What it does

Pulls lap-by-lap timing data for two drivers (Hamilton #44, Leclerc #16) from
the [OpenF1 API](https://openf1.org/) for the most recently completed race
weekend, and persists it to Postgres.

## Project structure

- **`openf1_client.py`** — transport layer. Request pacing and retry/backoff
  for talking to OpenF1 safely. Has no idea what a "lap" or "driver" is.
- **`fetch_laps.py`** — domain layer. Which drivers/session to pull and what
  to do with the data; imports `request_with_retry` from the client instead
  of calling `requests` directly.
- **`db.py`** — persistence layer. Postgres connection handling and the
  upsert functions (`upsert_race`, `upsert_driver`, `upsert_laps`). Knows
  about the schema; doesn't know anything about HTTP.
- **`schema.sql`** — table definitions for `races`, `drivers`, `laps`.

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
- [ ] **part 5** — GitHub Actions scheduling, running automatically after
      each race weekend.
- [ ] **part 6** — minimal read-only frontend once Part 3's DB has
      a few races in it (e.g. a small Flask + Jinja2 page, or Grafana pointed
      at the Postgres container) to visualize lap time trends and Hamilton vs.
      Leclerc deltas across races.

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

## Known data quirks (not bugs)

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

```bash
docker compose up -d   # start Postgres (first time only, or after a reboot)
py fetch_laps.py
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
   Get-Content schema.sql -Raw | docker exec -i f1_tracker_db psql -U f1user -d f1tracker
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

- Python + `requests` — OpenF1 REST API client (`openf1_client.py`)
- `psycopg2` + Postgres via Docker Compose — persistence (`db.py`, `schema.sql`)
- GitHub Actions — scheduling (Part 5)

---
