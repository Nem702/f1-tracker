"""
Read-only JSON API over the f1-tracker Postgres database, for the Part 6
frontend. Serves what the fetch pipeline has already persisted — it never
calls OpenF1 itself, so it's immune to rate limits and the live-session
lockout. No writes: every endpoint is a SELECT.

Run from the repo root:  py -m uvicorn api.main:app --reload
"""

import os

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from psycopg2.extras import RealDictCursor

from db import get_connection
from logger import logger

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


def ferrari_driver_numbers(conn):
    """Resolve Hamilton/Leclerc numbers from the drivers table — the DB mirror
    of the per-session /drivers resolution; numbers are never hardcoded."""
    rows = query(conn, "SELECT driver_number, name FROM drivers")
    ham = next((r["driver_number"] for r in rows if "hamilton" in r["name"].lower()), None)
    lec = next((r["driver_number"] for r in rows if "leclerc" in r["name"].lower()), None)
    if ham is None or lec is None:
        raise HTTPException(status_code=500, detail="Ferrari drivers not found in drivers table")
    return ham, lec


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


@app.get("/api/races/{session_key}/delta")
def delta(session_key: int, conn=Depends(get_db)):
    """Per-lap teammate delta, only for laps both drivers completed with a
    recorded time. Positive delta = Leclerc was faster that lap (Hamilton's
    lap took longer)."""
    logger.debug("GET /api/races/%s/delta", session_key)
    require_race(conn, session_key)
    ham, lec = ferrari_driver_numbers(conn)
    return query(
        conn,
        """
        SELECT h.lap_number,
               h.lap_duration AS hamilton_duration,
               l.lap_duration AS leclerc_duration,
               h.lap_duration - l.lap_duration AS delta
        FROM laps h
        JOIN laps l ON l.session_key = h.session_key AND l.lap_number = h.lap_number
        WHERE h.session_key = %s
          AND h.driver_number = %s AND l.driver_number = %s
          AND h.lap_duration IS NOT NULL AND l.lap_duration IS NOT NULL
        ORDER BY h.lap_number
        """,
        (session_key, ham, lec),
    )
