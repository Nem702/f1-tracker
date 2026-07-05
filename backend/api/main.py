"""
Read-only JSON API over the f1-tracker Postgres database, for the Part 6
frontend. Serves what the fetch pipeline has already persisted — it never
calls OpenF1 itself, so it's immune to rate limits and the live-session
lockout. No writes: every endpoint is a SELECT.

The single documented exception is GET /api/next-race: the races table has
zero future rows (backfill only stores completed sessions), so that one
endpoint calls OpenF1 live, through an in-process TTL cache, and degrades to
a stale cache or {"next_session": null} instead of ever raising a 5xx.

Run from the repo root:  py -m uvicorn backend.api.main:app --reload --reload-dir backend
(or just run dev.ps1, which starts this and the frontend together)
"""

import os
import time
from datetime import datetime, timezone

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from psycopg2.extras import RealDictCursor

from backend.shared.db import get_connection
from backend.shared.logger import logger
from backend.shared.next_race import get_next_session

app = FastAPI(title="f1-tracker API", version="0.1.0")

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


_NEXT_RACE_TTL_SECONDS = 60 * 60
_next_race_cache = {"payload": None, "fetched_at": 0.0}


def _utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


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

    if cached is not None and cache_age < _NEXT_RACE_TTL_SECONDS:
        logger.debug("GET /api/next-race - cache hit (age %.0fs)", cache_age)
        return cached

    try:
        result = get_next_session()
    except Exception:
        logger.exception("GET /api/next-race - OpenF1 fetch failed")
        if cached is not None:
            logger.warning("GET /api/next-race - serving stale cache after fetch error")
            return cached
        logger.warning("GET /api/next-race - no cache available, returning null")
        return {"next_session": None, "fetched_at": _utc_now_iso()}

    payload = {
        "next_session": _next_race_payload(*result) if result else None,
        "fetched_at": _utc_now_iso(),
    }
    _next_race_cache["payload"] = payload
    _next_race_cache["fetched_at"] = now
    logger.debug("GET /api/next-race - fetched fresh from OpenF1")
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
def laps(session_key: int, conn=Depends(get_db)):
    logger.debug("GET /api/races/%s/laps", session_key)
    require_race(conn, session_key)
    return query(
        conn,
        "SELECT * FROM laps WHERE session_key = %s ORDER BY driver_number, lap_number",
        (session_key,),
    )


@app.get("/api/races/{session_key}/stints")
def stints(session_key: int, conn=Depends(get_db)):
    logger.debug("GET /api/races/%s/stints", session_key)
    require_race(conn, session_key)
    return query(
        conn,
        "SELECT * FROM stints WHERE session_key = %s ORDER BY driver_number, stint_number",
        (session_key,),
    )


@app.get("/api/races/{session_key}/pit")
def pit(session_key: int, conn=Depends(get_db)):
    logger.debug("GET /api/races/%s/pit", session_key)
    require_race(conn, session_key)
    return query(
        conn,
        "SELECT * FROM pit WHERE session_key = %s ORDER BY driver_number, lap_number",
        (session_key,),
    )


@app.get("/api/races/{session_key}/positions")
def positions(session_key: int, conn=Depends(get_db)):
    logger.debug("GET /api/races/%s/positions", session_key)
    require_race(conn, session_key)
    return query(
        conn,
        "SELECT * FROM positions WHERE session_key = %s ORDER BY driver_number, date",
        (session_key,),
    )


@app.get("/api/races/{session_key}/weather")
def weather(session_key: int, conn=Depends(get_db)):
    logger.debug("GET /api/races/%s/weather", session_key)
    require_race(conn, session_key)
    return query(
        conn,
        "SELECT * FROM weather WHERE session_key = %s ORDER BY date",
        (session_key,),
    )


@app.get("/api/races/{session_key}/race-control")
def race_control(session_key: int, conn=Depends(get_db)):
    logger.debug("GET /api/races/%s/race-control", session_key)
    require_race(conn, session_key)
    return query(
        conn,
        "SELECT * FROM race_control WHERE session_key = %s ORDER BY date",
        (session_key,),
    )
