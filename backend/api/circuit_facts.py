"""Circuit facts edited from /admin. A row in the circuit_facts table replaces
that circuit's entry in backend/shared/circuit_facts.json; circuits without a
row keep the JSON. The table and its write-only-this-table role are created
by backend/sql/16-circuit-facts.sql."""

from datetime import datetime, timezone
from typing import Annotated

from psycopg2.extras import RealDictCursor
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from backend.shared.race_weekend import _CIRCUIT_FACTS

# The JSON is also the list of circuits that can be edited at all.
JSON_FACTS: dict = _CIRCUIT_FACTS


def _not_after_this_year(year: int) -> int:
    # Here rather than as a DB CHECK: Postgres expects CHECK expressions to be
    # immutable, and "this year" isn't.
    this_year = datetime.now(timezone.utc).year
    if year > this_year:
        raise ValueError(f"must be {this_year} or earlier")
    return year


# The bounds match the CHECK constraints in backend/sql/16-circuit-facts.sql.
# [0-9], not \d: pydantic's regex engine treats \d as any Unicode digit.
class LapRecord(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    time: str = Field(pattern=r"^[0-9]:[0-5][0-9]\.[0-9]{3}$")
    driver: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    year: int = Field(ge=1950)

    _year_ceiling = field_validator("year")(_not_after_this_year)


class CircuitFacts(BaseModel):
    # strict: "58" stays a type error instead of quietly becoming 58.
    model_config = ConfigDict(extra="forbid", strict=True)

    length_km: float = Field(ge=2.0, le=8.0)
    turns: int = Field(ge=5, le=30)
    laps: int | None = Field(default=None, ge=40, le=90)
    first_gp: int = Field(ge=1950)
    lap_record: LapRecord | None = None
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]

    _first_gp_ceiling = field_validator("first_gp")(_not_after_this_year)


def row_to_facts(row) -> dict:
    """The JSON entry's shape, key for key. laps is left out when null, as
    in the JSON (Madring), so the public payload doesn't change shape."""
    facts = {"length_km": row["length_km"], "turns": row["turns"]}
    if row["laps"] is not None:
        facts["laps"] = row["laps"]
    facts["first_gp"] = row["first_gp"]
    facts["lap_record"] = (
        None
        if row["lap_record_time"] is None
        else {"time": row["lap_record_time"], "driver": row["lap_record_driver"], "year": row["lap_record_year"]}
    )
    facts["note"] = row["note"]
    return facts


def effective(circuit_id: str, row) -> dict:
    """One circuit as the admin page lists it: the facts in effect and where
    they come from."""
    if row is None:
        return {"circuit_id": circuit_id, "source": "json", "facts": JSON_FACTS[circuit_id],
                "updated_at": None, "updated_by": None}
    return {"circuit_id": circuit_id, "source": "db", "facts": row_to_facts(row),
            "updated_at": row["updated_at"], "updated_by": row["updated_by"]}


_UPSERT = """
INSERT INTO circuit_facts (circuit_id, length_km, turns, laps, first_gp,
                           lap_record_time, lap_record_driver, lap_record_year,
                           note, updated_by)
VALUES (%(circuit_id)s, %(length_km)s, %(turns)s, %(laps)s, %(first_gp)s,
        %(lap_record_time)s, %(lap_record_driver)s, %(lap_record_year)s,
        %(note)s, %(updated_by)s)
ON CONFLICT (circuit_id) DO UPDATE SET
    length_km = EXCLUDED.length_km,
    turns = EXCLUDED.turns,
    laps = EXCLUDED.laps,
    first_gp = EXCLUDED.first_gp,
    lap_record_time = EXCLUDED.lap_record_time,
    lap_record_driver = EXCLUDED.lap_record_driver,
    lap_record_year = EXCLUDED.lap_record_year,
    note = EXCLUDED.note,
    updated_at = now(),
    updated_by = EXCLUDED.updated_by
RETURNING *
"""


def upsert(conn, circuit_id: str, facts: CircuitFacts, user_id: str) -> dict:
    """Insert or replace one circuit's row and return it. `with conn` commits
    on success and rolls back on an exception; closing is the caller's job."""
    record = facts.lap_record
    params = {
        "circuit_id": circuit_id,
        "length_km": facts.length_km,
        "turns": facts.turns,
        "laps": facts.laps,
        "first_gp": facts.first_gp,
        "lap_record_time": record.time if record else None,
        "lap_record_driver": record.driver if record else None,
        "lap_record_year": record.year if record else None,
        "note": facts.note,
        "updated_by": user_id,
    }
    with conn, conn.cursor(cursor_factory=RealDictCursor) as cur:
        cur.execute(_UPSERT, params)
        return cur.fetchone()
