"""
Write path for the fetch pipeline: one upsert helper per table, moved
verbatim out of the old root db.py. Connection handling stays in
backend/shared/db.py — the API imports that too, but nothing outside the
pipeline should ever import this module.
"""

from backend.shared.logger import logger


def upsert_race(conn, session):
    """session is the raw dict from /sessions — already has everything we need."""
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO races (session_key, location, country_name, circuit_short_name, date_start, date_end, year)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            ON CONFLICT (session_key) DO UPDATE SET
                location = EXCLUDED.location,
                country_name = EXCLUDED.country_name,
                circuit_short_name = EXCLUDED.circuit_short_name,
                date_start = EXCLUDED.date_start,
                date_end = EXCLUDED.date_end,
                year = EXCLUDED.year
            """,
            (
                session["session_key"],
                session.get("location"),
                session.get("country_name"),
                session.get("circuit_short_name"),
                session["date_start"],
                session["date_end"],
                session["year"],
            ),
        )
    conn.commit()
    logger.debug("upserted race session_key=%s (%s)", session["session_key"], session.get("location"))


def upsert_driver(conn, driver_number, name):
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO drivers (driver_number, name)
            VALUES (%s, %s)
            ON CONFLICT (driver_number) DO UPDATE SET name = EXCLUDED.name
            """,
            (driver_number, name),
        )
    conn.commit()
    logger.debug("upserted driver #%d (%s)", driver_number, name)


def upsert_laps(conn, session_key, driver_number, laps):
    """laps is the raw list of dicts from /laps for one driver."""
    with conn.cursor() as cur:
        for lap in laps:
            cur.execute(
                """
                INSERT INTO laps (
                    session_key, driver_number, lap_number, date_start, lap_duration,
                    duration_sector_1, duration_sector_2, duration_sector_3,
                    i1_speed, i2_speed, st_speed, is_pit_out_lap
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (session_key, driver_number, lap_number) DO UPDATE SET
                    date_start = EXCLUDED.date_start,
                    lap_duration = EXCLUDED.lap_duration,
                    duration_sector_1 = EXCLUDED.duration_sector_1,
                    duration_sector_2 = EXCLUDED.duration_sector_2,
                    duration_sector_3 = EXCLUDED.duration_sector_3,
                    i1_speed = EXCLUDED.i1_speed,
                    i2_speed = EXCLUDED.i2_speed,
                    st_speed = EXCLUDED.st_speed,
                    is_pit_out_lap = EXCLUDED.is_pit_out_lap
                """,
                (
                    session_key,
                    driver_number,
                    lap["lap_number"],
                    lap.get("date_start"),
                    lap.get("lap_duration"),
                    lap.get("duration_sector_1"),
                    lap.get("duration_sector_2"),
                    lap.get("duration_sector_3"),
                    lap.get("i1_speed"),
                    lap.get("i2_speed"),
                    lap.get("st_speed"),
                    lap.get("is_pit_out_lap"),
                ),
            )
    conn.commit()
    logger.debug("upserted %d laps for driver #%d session_key=%s", len(laps), driver_number, session_key)

def upsert_stints(conn, session_key, driver_number, stints):
    """stints is the raw list of dicts from /stints for one driver."""
    with conn.cursor() as cur:
        for stint in stints:
            cur.execute(
                """
                INSERT INTO stints (
                    session_key, driver_number, stint_number,
                    lap_start, lap_end, compound, tyre_age_at_start
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (session_key, driver_number, stint_number) DO UPDATE SET
                    lap_start = EXCLUDED.lap_start,
                    lap_end = EXCLUDED.lap_end,
                    compound = EXCLUDED.compound,
                    tyre_age_at_start = EXCLUDED.tyre_age_at_start
                """,
                (
                    session_key,
                    driver_number,
                    stint["stint_number"],
                    stint.get("lap_start"),
                    stint.get("lap_end"),
                    stint.get("compound"),
                    stint.get("tyre_age_at_start"),
                ),
            )
    conn.commit()
    logger.debug("upserted %d stints for driver #%d session_key=%s", len(stints), driver_number, session_key)


def upsert_pit(conn, session_key, driver_number, pit_stops):
    """pit_stops is the raw list of dicts from /pit for one driver."""
    with conn.cursor() as cur:
        for stop in pit_stops:
            cur.execute(
                """
                INSERT INTO pit (session_key, driver_number, lap_number, pit_duration, date)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (session_key, driver_number, lap_number) DO UPDATE SET
                    pit_duration = EXCLUDED.pit_duration,
                    date = EXCLUDED.date
                """,
                (
                    session_key,
                    driver_number,
                    stop["lap_number"],
                    stop.get("pit_duration"),
                    stop.get("date"),
                ),
            )
    conn.commit()
    logger.debug("upserted %d pit stops for driver #%d session_key=%s", len(pit_stops), driver_number, session_key)


def upsert_weather(conn, session_key, readings):
    """readings is the raw list of dicts from /weather — session-wide, not per-driver."""
    with conn.cursor() as cur:
        for reading in readings:
            cur.execute(
                """
                INSERT INTO weather (
                    session_key, date, air_temperature, track_temperature,
                    humidity, pressure, rainfall, wind_direction, wind_speed
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (session_key, date) DO UPDATE SET
                    air_temperature = EXCLUDED.air_temperature,
                    track_temperature = EXCLUDED.track_temperature,
                    humidity = EXCLUDED.humidity,
                    pressure = EXCLUDED.pressure,
                    rainfall = EXCLUDED.rainfall,
                    wind_direction = EXCLUDED.wind_direction,
                    wind_speed = EXCLUDED.wind_speed
                """,
                (
                    session_key,
                    reading["date"],
                    reading.get("air_temperature"),
                    reading.get("track_temperature"),
                    reading.get("humidity"),
                    reading.get("pressure"),
                    reading.get("rainfall"),
                    reading.get("wind_direction"),
                    reading.get("wind_speed"),
                ),
            )
    conn.commit()
    logger.debug("upserted %d weather readings session_key=%s", len(readings), session_key)


def upsert_positions(conn, session_key, driver_number, positions):
    """positions is the raw list of dicts from /position for one driver."""
    with conn.cursor() as cur:
        for pos in positions:
            cur.execute(
                """
                INSERT INTO positions (session_key, driver_number, date, position)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (session_key, driver_number, date) DO UPDATE SET
                    position = EXCLUDED.position
                """,
                (
                    session_key,
                    driver_number,
                    pos["date"],
                    pos.get("position"),
                ),
            )
    conn.commit()
    logger.debug("upserted %d positions for driver #%d session_key=%s", len(positions), driver_number, session_key)


def race_control_already_fetched(conn, session_key):
    """race_control is insert-only (no ON CONFLICT), so re-running an
    already-fetched race would duplicate rows — callers check this first."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT EXISTS (SELECT 1 FROM race_control WHERE session_key = %s)",
            (session_key,),
        )
        return cur.fetchone()[0]


def insert_race_control(conn, session_key, messages):
    """messages is the raw list of dicts from /race_control — session-wide, insert-only.
    No ON CONFLICT: this is an append-only event log, not upserted.

    driver_number may reference a car not in our drivers table (e.g. a team
    we're not tracking yet). We null it out rather than violate the FK —
    this self-resolves as more drivers get added to the roster."""
    with conn.cursor() as cur:
        cur.execute("SELECT driver_number FROM drivers")
        known_drivers = {row[0] for row in cur.fetchall()}

        skipped = 0
        for msg in messages:
            driver_number = msg.get("driver_number")
            if driver_number is not None and driver_number not in known_drivers:
                skipped += 1
                driver_number = None

            cur.execute(
                """
                INSERT INTO race_control (
                    session_key, date, category, flag, scope, sector, driver_number, message
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    session_key,
                    msg.get("date"),
                    msg.get("category"),
                    msg.get("flag"),
                    msg.get("scope"),
                    msg.get("sector"),
                    driver_number,
                    msg.get("message"),
                ),
            )
    conn.commit()
    logger.debug(
        "inserted %d race control messages session_key=%s (%d had untracked driver_number nulled)",
        len(messages), session_key, skipped,
    )
