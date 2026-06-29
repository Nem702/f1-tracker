"""
Postgres connection handling. Reads credentials from .env so they're
never hardcoded in source.
"""

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()


def get_connection():
    return psycopg2.connect(
        host="localhost",
        port=5432,
        dbname=os.environ["POSTGRES_DB"],
        user=os.environ["POSTGRES_USER"],
        password=os.environ["POSTGRES_PASSWORD"],
    )

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