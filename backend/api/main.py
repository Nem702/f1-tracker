"""
Read-only JSON API over the f1-tracker Postgres database, for the Part 6
frontend. Serves what the fetch pipeline has already persisted — it never
calls OpenF1 itself, so it's immune to rate limits and the live-session
lockout. No writes: every endpoint is a SELECT.

Several documented exceptions call out live instead of reading Postgres,
each through its own cache (persisted to disk so a restart keeps the
fallback), and each degrading to a stale cache or a null payload instead of
ever raising a 5xx:
  - GET /api/next-race: the races table has zero future rows (backfill only
    stores completed sessions), so this calls OpenF1 live. TTL-cached.
  - GET /api/race-weekend, GET /api/standings: season schedule, circuit
    info, standings, and historical results aren't OpenF1 concepts at all,
    so these call the free Jolpica F1 API (Ergast-schema) live instead.
    TTL-cached (this data changes at most weekly).
  - GET /api/races/{session_key}/official-result: also Jolpica-backed, but
    a *finished* race's result is immutable forever — cached with no TTL
    at all (see that endpoint's docstring for why a plain TTL cache isn't
    the right shape here).

Run from the repo root:  py -m uvicorn backend.api.main:app --reload --reload-dir backend
(or just run dev.ps1, which starts this and the frontend together)
"""

import json
import os
import time
from collections import defaultdict, deque
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, Depends, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from psycopg2.extras import RealDictCursor

from backend.shared.db import get_connection
from backend.shared.logger import logger
from backend.shared.jolpica_lookup import find_jolpica_round
from backend.shared.jolpica_results import get_official_result
from backend.shared.next_race import get_next_session
from backend.shared.race_weekend import get_race_weekend, get_standings

app = FastAPI(title="f1-tracker API", version="0.1.0")

# Per-client rate limiting: an in-process sliding window, no external
# dependency — a single uvicorn process serves everything at this scale, so
# process-local state is the whole truth. It protects two things: free-tier
# Render/Neon capacity on the bulk endpoints, and the OpenF1/Jolpica
# upstreams reached on the cache-miss paths (without a cap, a request flood
# while a cache is cold turns this server into an amplifier against them).
# The ceiling is deliberately generous: a page load fires ~12 API calls and
# each race switch ~7 more, so a person flipping through races legitimately
# spikes well past 60/min. 120/min only stops scripted hammering.
_RATE_LIMIT_MAX_REQUESTS = 120
_RATE_LIMIT_WINDOW_SECONDS = 60.0
_RATE_SWEEP_EVERY = 1000
_rate_buckets: dict[str, deque] = defaultdict(deque)  # client -> request timestamps (monotonic)
_rate_sweep_countdown = _RATE_SWEEP_EVERY


def _client_id(request: Request) -> str:
    """Render terminates TLS at its proxy, so request.client holds the
    proxy's address — the real caller is the first X-Forwarded-For hop. A
    direct connection (local dev) has no such header. The leftmost entry is
    client-controllable in principle, but spoofing it only rotates buckets,
    which is no worse than the same flood from genuinely distinct IPs."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# Registered before the CORS middleware below, which makes CORS the outer
# layer — that ordering matters: a 429 produced here still passes through
# CORSMiddleware on the way out, so the browser lets the frontend read the
# status instead of surfacing an opaque CORS failure.
@app.middleware("http")
async def rate_limit(request: Request, call_next):
    # /health is exempt so Render's health checker can never be locked out
    # by (or counted toward) visitor traffic.
    if request.url.path == "/health":
        return await call_next(request)

    global _rate_sweep_countdown
    now = time.monotonic()
    bucket = _rate_buckets[_client_id(request)]
    while bucket and now - bucket[0] > _RATE_LIMIT_WINDOW_SECONDS:
        bucket.popleft()
    if len(bucket) >= _RATE_LIMIT_MAX_REQUESTS:
        retry_after = max(1, round(_RATE_LIMIT_WINDOW_SECONDS - (now - bucket[0])))
        logger.warning("rate limit exceeded by %s on %s", _client_id(request), request.url.path)
        return JSONResponse(
            {"detail": "Too many requests"},
            status_code=429,
            headers={"Retry-After": str(retry_after), "X-Content-Type-Options": "nosniff"},
        )
    bucket.append(now)

    # Every _RATE_SWEEP_EVERY requests, drop clients idle for a full window
    # so the bucket dict can't grow unbounded across weeks of uptime.
    _rate_sweep_countdown -= 1
    if _rate_sweep_countdown <= 0:
        _rate_sweep_countdown = _RATE_SWEEP_EVERY
        stale = [c for c, b in _rate_buckets.items() if not b or now - b[-1] > _RATE_LIMIT_WINDOW_SECONDS]
        for c in stale:
            del _rate_buckets[c]

    response = await call_next(request)
    # nosniff on every response: near-zero cost, and stops a browser from
    # ever second-guessing the JSON content type.
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


# The Vite dev server is always allowed; add the deployed frontend's origin
# (e.g. the Vercel URL) via ALLOWED_ORIGINS, comma-separated, without a
# code change or redeploy.
_default_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
_extra_origins = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
# Vercel preview deploys get a unique per-branch/per-commit subdomain
# (e.g. https://f1-tracker-git-<branch>-<user>.vercel.app), which can't be
# enumerated in ALLOWED_ORIGINS ahead of time. Match those by pattern; the
# exact production domain still comes in via ALLOWED_ORIGINS.
_preview_origin_regex = r"https://f1-tracker-[a-z0-9-]+\.vercel\.app"
app.add_middleware(
    CORSMiddleware,
    allow_origins=_default_origins + _extra_origins,
    allow_origin_regex=_preview_origin_regex,
    allow_methods=["GET"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=500)


@app.get("/health")
def health():
    """Liveness/readiness probe for Render. Deliberately doesn't touch the
    DB — Neon's free tier cold-starts on the first connection (can take a
    few seconds), and a health check that depends on that would flap the
    service as unhealthy right after a deploy or idle period."""
    return {"status": "ok"}


def get_db():
    """One connection per request, always closed — no pooling needed at this scale."""
    try:
        conn = get_connection()
    except Exception:
        logger.exception("Failed to connect to the database")
        raise HTTPException(status_code=503, detail="Database unavailable")
    try:
        yield conn
    finally:
        conn.close()


def query(conn, sql, params=()):
    with conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def require_race(conn, session_key):
    rows = query(conn, "SELECT 1 FROM races WHERE session_key = %s", (session_key,))
    if not rows:
        raise HTTPException(status_code=404, detail=f"Unknown session_key {session_key}")


def _cache_immutable(response: Response):
    """Per-session telemetry never changes once backfilled, so the browser
    can cache it indefinitely without any invalidation logic."""
    response.headers["Cache-Control"] = "public, max-age=3600"


_NEXT_RACE_TTL_SECONDS = 60 * 60
_next_race_cache = {"payload": None, "fetched_at": 0.0}

# The last good payload also persists to disk: during a race weekend OpenF1
# 401s every unauthenticated request, so a process that starts mid-weekend
# (uvicorn --reload on every save, a Render restart) has an empty in-process
# cache and would serve null for the whole weekend. Loading the file gives
# the stale-fallback tier back; fetched_at stays 0.0 so the first request
# still tries a fresh fetch and only falls back to the loaded payload if
# that fails.
_NEXT_RACE_CACHE_FILE = Path(__file__).resolve().parents[1] / ".next_race_cache.json"


def _load_next_race_cache():
    try:
        payload = json.loads(_NEXT_RACE_CACHE_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return
    except Exception:
        logger.exception("next-race cache file unreadable - ignoring it")
        return
    if isinstance(payload, dict) and "next_session" in payload:
        _next_race_cache["payload"] = payload


def _save_next_race_cache(payload):
    try:
        _NEXT_RACE_CACHE_FILE.write_text(json.dumps(payload), encoding="utf-8")
    except Exception:
        logger.exception("next-race cache file unwritable - continuing without persistence")


_load_next_race_cache()


def _utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def _session_passed(payload):
    """True when the payload names a session whose start time has passed —
    refetch (or, failing that, hide the card) instead of serving a countdown
    frozen at 00:00:00. A malformed entry counts as passed: never worth
    serving. A null next_session is NOT passed — it's a valid 'nothing
    upcoming' answer that the TTL window may serve as-is."""
    session = payload.get("next_session")
    if session is None:
        return False
    try:
        starts = datetime.fromisoformat(session["date_start"])
    except (KeyError, TypeError, ValueError):
        return True
    return starts <= datetime.now(timezone.utc)


def _usable_fallback(payload):
    """A stale payload only helps the frontend if it still names a future
    session — a cached null would render the same hidden card as no cache."""
    return payload.get("next_session") is not None and not _session_passed(payload)


def _next_race_payload(next_dt, session):
    return {
        "session_name": session.get("session_name"),
        "circuit_short_name": session.get("circuit_short_name"),
        "location": session.get("location"),
        "country_name": session.get("country_name"),
        "date_start": next_dt.isoformat(),
    }


@app.get("/api/next-race")
def next_race():
    """Live OpenF1 lookup, cached for _NEXT_RACE_TTL_SECONDS — see module
    docstring. Any OpenF1 failure (including the free-tier 401 lockout while
    a session is live) falls back to the last good cache, or to
    {"next_session": null} if nothing has ever been cached. Never a 5xx."""
    now = time.monotonic()
    cached = _next_race_cache["payload"]
    cache_age = now - _next_race_cache["fetched_at"]

    # A cached session whose start has passed bypasses the TTL: the moment a
    # session begins, the *next* one is the right answer (the frontend
    # refetches exactly once when its countdown hits zero and expects this).
    if (
        cached is not None
        and cache_age < _NEXT_RACE_TTL_SECONDS
        and not _session_passed(cached)
    ):
        logger.debug("GET /api/next-race - cache hit (age %.0fs)", cache_age)
        return cached

    try:
        result = get_next_session()
    except Exception:
        logger.exception("GET /api/next-race - OpenF1 fetch failed")
        if cached is not None and _usable_fallback(cached):
            logger.warning("GET /api/next-race - serving stale cache after fetch error")
            return cached
        logger.warning("GET /api/next-race - no usable cache, returning null")
        return {"next_session": None, "fetched_at": _utc_now_iso()}

    payload = {
        "next_session": _next_race_payload(*result) if result else None,
        "fetched_at": _utc_now_iso(),
    }
    _next_race_cache["payload"] = payload
    _next_race_cache["fetched_at"] = now
    _save_next_race_cache(payload)
    logger.debug("GET /api/next-race - fetched fresh from OpenF1")
    return payload


# Race-weekend detail (schedule/circuit/standings/last-year-winner) changes
# at most once a week, so this gets a much longer TTL than /api/next-race —
# no point re-fetching four Jolpica endpoints on every page load.
_RACE_WEEKEND_TTL_SECONDS = 6 * 60 * 60
_race_weekend_cache = {"payload": None, "fetched_at": 0.0}
_RACE_WEEKEND_CACHE_FILE = Path(__file__).resolve().parents[1] / ".race_weekend_cache.json"


def _load_race_weekend_cache():
    try:
        payload = json.loads(_RACE_WEEKEND_CACHE_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return
    except Exception:
        logger.exception("race-weekend cache file unreadable - ignoring it")
        return
    if isinstance(payload, dict) and "race_weekend" in payload:
        _race_weekend_cache["payload"] = payload


def _save_race_weekend_cache(payload):
    try:
        _RACE_WEEKEND_CACHE_FILE.write_text(json.dumps(payload), encoding="utf-8")
    except Exception:
        logger.exception("race-weekend cache file unwritable - continuing without persistence")


_load_race_weekend_cache()


@app.get("/api/race-weekend")
def race_weekend():
    """Jolpica-backed aggregate for the race-weekend page: round/circuit,
    weekend session times, last year's winner at that circuit, and top-5
    driver/constructor standings. Cached for _RACE_WEEKEND_TTL_SECONDS with
    the same disk-persisted stale-fallback pattern as /api/next-race, so a
    Jolpica hiccup never 5xx's — see that endpoint's docstring above."""
    now = time.monotonic()
    cached = _race_weekend_cache["payload"]
    cache_age = now - _race_weekend_cache["fetched_at"]

    if cached is not None and cache_age < _RACE_WEEKEND_TTL_SECONDS:
        logger.debug("GET /api/race-weekend - cache hit (age %.0fs)", cache_age)
        return cached

    try:
        result = get_race_weekend()
    except Exception:
        logger.exception("GET /api/race-weekend - Jolpica fetch failed")
        if cached is not None:
            logger.warning("GET /api/race-weekend - serving stale cache after fetch error")
            return cached
        logger.warning("GET /api/race-weekend - no usable cache, returning null")
        return {"race_weekend": None, "fetched_at": _utc_now_iso()}

    payload = {"race_weekend": result, "fetched_at": _utc_now_iso()}
    _race_weekend_cache["payload"] = payload
    _race_weekend_cache["fetched_at"] = now
    _save_race_weekend_cache(payload)
    logger.debug("GET /api/race-weekend - fetched fresh from Jolpica")
    return payload


# Full/uncapped standings changes on the same cadence as race-weekend's
# top-5 cards, so it gets the same TTL and cache shape.
_STANDINGS_TTL_SECONDS = 6 * 60 * 60
_standings_cache = {"payload": None, "fetched_at": 0.0}
_STANDINGS_CACHE_FILE = Path(__file__).resolve().parents[1] / ".standings_cache.json"


def _load_standings_cache():
    try:
        payload = json.loads(_STANDINGS_CACHE_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return
    except Exception:
        logger.exception("standings cache file unreadable - ignoring it")
        return
    if isinstance(payload, dict) and "standings" in payload:
        _standings_cache["payload"] = payload


def _save_standings_cache(payload):
    try:
        _STANDINGS_CACHE_FILE.write_text(json.dumps(payload), encoding="utf-8")
    except Exception:
        logger.exception("standings cache file unwritable - continuing without persistence")


_load_standings_cache()


@app.get("/api/standings")
def standings():
    """Full/uncapped current-season driver + constructor standings, for
    the dedicated Standings page (Race Weekend's own standings cards stay
    top-5, unaffected by this). Same TTL + disk-fallback cache shape as
    /api/race-weekend, never a 5xx."""
    now = time.monotonic()
    cached = _standings_cache["payload"]
    cache_age = now - _standings_cache["fetched_at"]

    if cached is not None and cache_age < _STANDINGS_TTL_SECONDS:
        logger.debug("GET /api/standings - cache hit (age %.0fs)", cache_age)
        return cached

    try:
        result = get_standings()
    except Exception:
        logger.exception("GET /api/standings - Jolpica fetch failed")
        if cached is not None:
            logger.warning("GET /api/standings - serving stale cache after fetch error")
            return cached
        logger.warning("GET /api/standings - no usable cache, returning null")
        return {"standings": None, "fetched_at": _utc_now_iso()}

    payload = {"standings": result, "fetched_at": _utc_now_iso()}
    _standings_cache["payload"] = payload
    _standings_cache["fetched_at"] = now
    _save_standings_cache(payload)
    logger.debug("GET /api/standings - fetched fresh from Jolpica")
    return payload


# Official race results are immutable once a race has finished, unlike
# every other Jolpica-backed cache above — so this one has no TTL at all,
# keyed per session_key instead of a single slot. Critically: only a
# SUCCESSFUL lookup ever gets cached (see official_result() below) — the
# other caches can safely hold a stale/null payload because their TTL
# guarantees a retry later; this cache has no TTL, so caching a failure
# would hide the data forever even after Jolpica recovers.
_official_result_cache: dict[str, dict] = {}
_OFFICIAL_RESULT_CACHE_FILE = Path(__file__).resolve().parents[1] / ".official_result_cache.json"


def _load_official_result_cache():
    try:
        payload = json.loads(_OFFICIAL_RESULT_CACHE_FILE.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return
    except Exception:
        logger.exception("official-result cache file unreadable - ignoring it")
        return
    if isinstance(payload, dict):
        _official_result_cache.update(payload)


def _save_official_result_cache():
    try:
        _OFFICIAL_RESULT_CACHE_FILE.write_text(json.dumps(_official_result_cache), encoding="utf-8")
    except Exception:
        logger.exception("official-result cache file unwritable - continuing without persistence")


_load_official_result_cache()


def _get_race_row(conn, session_key):
    rows = query(conn, "SELECT date_start, year FROM races WHERE session_key = %s", (session_key,))
    return rows[0] if rows else None


@app.get("/api/races/{session_key}/official-result")
def official_result(session_key: int, conn=Depends(get_db)):
    """Official classification + qualifying (+ sprint, when applicable)
    for a past race, joined from our own `races` row to its Jolpica
    season/round via find_jolpica_round() (date-matched — see that
    function's docstring). Cached forever once resolved (immutable data);
    a lookup miss or Jolpica error returns a null payload WITHOUT caching
    it, so the next request tries again instead of being stuck null."""
    row = _get_race_row(conn, session_key)
    if row is None:
        raise HTTPException(status_code=404, detail=f"Unknown session_key {session_key}")

    cache_key = str(session_key)
    cached = _official_result_cache.get(cache_key)
    if cached is not None:
        logger.debug("GET /api/races/%s/official-result - cache hit", session_key)
        return cached

    try:
        ref = find_jolpica_round(row["year"], row["date_start"])
        if ref is None:
            logger.warning("GET /api/races/%s/official-result - no Jolpica round matched", session_key)
            return {"official_result": None, "fetched_at": _utc_now_iso()}
        result = get_official_result(ref["season"], ref["round"], ref["has_sprint"])
    except Exception:
        logger.exception("GET /api/races/%s/official-result - Jolpica fetch failed", session_key)
        return {"official_result": None, "fetched_at": _utc_now_iso()}

    payload = {
        "official_result": {
            "season": ref["season"],
            "round": ref["round"],
            "race_name": ref["race_name"],
            "has_sprint": ref["has_sprint"],
            "qualifying": result["qualifying"],
            "race": result["race"],
            "sprint": result["sprint"],
        },
        "fetched_at": _utc_now_iso(),
    }
    _official_result_cache[cache_key] = payload
    _save_official_result_cache()
    logger.debug("GET /api/races/%s/official-result - fetched fresh from Jolpica", session_key)
    return payload


@app.get("/api/races")
def races(conn=Depends(get_db)):
    logger.debug("GET /api/races")
    return query(conn, "SELECT * FROM races ORDER BY date_start DESC")


@app.get("/api/drivers")
def drivers(conn=Depends(get_db)):
    logger.debug("GET /api/drivers")
    return query(conn, "SELECT * FROM drivers ORDER BY driver_number")


@app.get("/api/races/{session_key}/laps")
def laps(session_key: int, response: Response, conn=Depends(get_db)):
    logger.debug("GET /api/races/%s/laps", session_key)
    require_race(conn, session_key)
    _cache_immutable(response)
    return query(
        conn,
        "SELECT * FROM laps WHERE session_key = %s ORDER BY driver_number, lap_number",
        (session_key,),
    )


@app.get("/api/races/{session_key}/stints")
def stints(session_key: int, response: Response, conn=Depends(get_db)):
    logger.debug("GET /api/races/%s/stints", session_key)
    require_race(conn, session_key)
    _cache_immutable(response)
    return query(
        conn,
        "SELECT * FROM stints WHERE session_key = %s ORDER BY driver_number, stint_number",
        (session_key,),
    )


@app.get("/api/races/{session_key}/pit")
def pit(session_key: int, response: Response, conn=Depends(get_db)):
    logger.debug("GET /api/races/%s/pit", session_key)
    require_race(conn, session_key)
    _cache_immutable(response)
    return query(
        conn,
        "SELECT * FROM pit WHERE session_key = %s ORDER BY driver_number, lap_number",
        (session_key,),
    )


@app.get("/api/races/{session_key}/positions")
def positions(session_key: int, response: Response, conn=Depends(get_db)):
    logger.debug("GET /api/races/%s/positions", session_key)
    require_race(conn, session_key)
    _cache_immutable(response)
    return query(
        conn,
        "SELECT * FROM positions WHERE session_key = %s ORDER BY driver_number, date",
        (session_key,),
    )


@app.get("/api/races/{session_key}/weather")
def weather(session_key: int, response: Response, conn=Depends(get_db)):
    logger.debug("GET /api/races/%s/weather", session_key)
    require_race(conn, session_key)
    _cache_immutable(response)
    return query(
        conn,
        "SELECT * FROM weather WHERE session_key = %s ORDER BY date",
        (session_key,),
    )


@app.get("/api/races/{session_key}/race-control")
def race_control(session_key: int, response: Response, conn=Depends(get_db)):
    logger.debug("GET /api/races/%s/race-control", session_key)
    require_race(conn, session_key)
    _cache_immutable(response)
    return query(
        conn,
        "SELECT * FROM race_control WHERE session_key = %s ORDER BY date",
        (session_key,),
    )
