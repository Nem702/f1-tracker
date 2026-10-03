-- Task 16: admin-edited circuit facts, plus the role the API writes them with.
--
-- Run once in the Neon SQL Editor as the table owner (neondb_owner). Create
-- the role here, never through the Neon Console: Console roles are made
-- members of neon_superuser and can write every table.

-- One row per edited circuit. A row replaces that circuit's entry in
-- backend/shared/circuit_facts.json; circuits without a row keep the JSON.
-- The bounds match the API's CircuitFacts model (backend/api/circuit_facts.py).
-- Years have no "<= current year" CHECK: Postgres expects CHECK expressions
-- to be immutable, so that ceiling is enforced by the API only.
CREATE TABLE IF NOT EXISTS circuit_facts (
    circuit_id TEXT PRIMARY KEY,
    length_km DOUBLE PRECISION NOT NULL CHECK (length_km BETWEEN 2.0 AND 8.0),
    turns INTEGER NOT NULL CHECK (turns BETWEEN 5 AND 30),
    laps INTEGER CHECK (laps BETWEEN 40 AND 90),
    first_gp INTEGER NOT NULL CHECK (first_gp >= 1950),
    lap_record_time TEXT CHECK (lap_record_time ~ '^[0-9]:[0-5][0-9]\.[0-9]{3}$'),
    lap_record_driver TEXT CHECK (char_length(lap_record_driver) BETWEEN 1 AND 60),
    lap_record_year INTEGER CHECK (lap_record_year >= 1950),
    note TEXT NOT NULL CHECK (char_length(note) <= 200),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_by TEXT NOT NULL,
    -- The lap record is all three columns or none.
    CHECK (
        (lap_record_time IS NULL AND lap_record_driver IS NULL AND lap_record_year IS NULL)
        OR (lap_record_time IS NOT NULL AND lap_record_driver IS NOT NULL AND lap_record_year IS NOT NULL)
    )
);

-- Postgres has no CREATE ROLE IF NOT EXISTS: on a re-run this statement
-- fails with "role already exists" and the rest still applies.
-- Type the password here in the editor and never save it to this file
-- (Neon wants 12+ characters with mixed case, a number and a symbol).
CREATE ROLE f1_admin_rw LOGIN PASSWORD '<replace-in-editor>';

-- Only this one table. SELECT is there because the upsert's ON CONFLICT and
-- RETURNING read the row back.
GRANT CONNECT ON DATABASE neondb TO f1_admin_rw;
GRANT USAGE ON SCHEMA public TO f1_admin_rw;
GRANT SELECT, INSERT, UPDATE ON circuit_facts TO f1_admin_rw;

-- Explicit, so the API's read path doesn't depend on default privileges.
GRANT SELECT ON circuit_facts TO f1_api_ro;

-- Verification: expect true, false, true, true, false.
SELECT
    has_table_privilege('f1_api_ro', 'circuit_facts', 'SELECT') AS ro_can_select_facts,
    has_table_privilege('f1_api_ro', 'circuit_facts', 'INSERT') AS ro_can_insert_facts,
    has_table_privilege('f1_admin_rw', 'circuit_facts', 'INSERT') AS admin_can_insert_facts,
    has_table_privilege('f1_admin_rw', 'circuit_facts', 'UPDATE') AS admin_can_update_facts,
    has_table_privilege('f1_admin_rw', 'laps', 'SELECT') AS admin_can_select_laps;
