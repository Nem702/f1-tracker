# F1 Tracker

Personal project for hands-on practice with REST API integration, retry/backoff
handling, idempotent database upserts, structured logging, containerized
storage, and CI scheduling — using real F1 lap timing data instead of a toy
dataset.

## What it does

Pulls lap-by-lap timing data for two drivers (Hamilton #44, Leclerc #16) from
the [OpenF1 API](https://openf1.org/) for the most recently completed race
weekend.

## Status

- [x] **part 1** — fetch-only script (`fetch_laps.py`), no DB. Pulls and
      prints lap data for both drivers from the latest completed race session.
- [x] **part 2 (in progress)** — retry/backoff for the API's 3 req/sec rate
      limit, proper exception handling (retryable vs. non-retryable
      failures), and proactive request pacing.
- [ ] **part 3** — Postgres via Docker Compose. Schema for races/drivers/laps.
      Idempotent upserts (`ON CONFLICT ... DO UPDATE`) so re-running a race
      doesn't duplicate rows. Credentials in `.env`, never hardcoded.
- [ ] **part 4** — structured logging via the `logging` module (what ran,
      when, what was pulled, what failed) instead of print statements.
- [ ] **part 5** — GitHub Actions scheduling, running automatically after
      each race weekend.

This is a skill-building project, not a finished product. The point is
hands-on practice with API integration, resilience patterns, and
containerized storage — done by hand rather than generated wholesale.

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

## Known data quirks (not bugs)

- Lap counts can legitimately differ between drivers in the same session — a
  DNF, retirement, or red flag means fewer laps for one driver. This needs
  intentional handling downstream (e.g. when comparing two drivers), not a
  fix to the fetch logic itself.

## Running it

```bash
py fetch_laps.py
```

(Windows: use `py`, not `python` — avoids the Windows Store alias issue.)

## Stack

- Python + `requests` — OpenF1 REST API client
- Postgres via Docker Compose — storage (Week 3+)
- GitHub Actions — scheduling (Week 5)

---

This README will fill out further (setup steps, schema, env vars) as later
weeks land.
