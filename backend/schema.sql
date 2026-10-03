--schema.sql
CREATE TABLE races (
    session_key INTEGER PRIMARY KEY,
    location TEXT,
    country_name TEXT,
    circuit_short_name TEXT,
    date_start TIMESTAMPTZ,
    date_end TIMESTAMPTZ,
    year INTEGER
);

CREATE TABLE drivers (
    driver_number INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    team_name TEXT,
    name_acronym TEXT
);

CREATE TABLE laps (
    session_key INTEGER REFERENCES races(session_key),
    driver_number INTEGER REFERENCES drivers(driver_number),
    lap_number INTEGER,
    date_start TIMESTAMPTZ,
    lap_duration NUMERIC,
    duration_sector_1 NUMERIC,
    duration_sector_2 NUMERIC,
    duration_sector_3 NUMERIC,
    i1_speed INTEGER,
    i2_speed INTEGER,
    st_speed INTEGER,
    is_pit_out_lap BOOLEAN,
    PRIMARY KEY (session_key, driver_number, lap_number)
);

-- Stints: tire compound/age per driver per stint within a session
CREATE TABLE IF NOT EXISTS stints (
    session_key INTEGER NOT NULL REFERENCES races(session_key),
    driver_number INTEGER NOT NULL REFERENCES drivers(driver_number),
    stint_number INTEGER NOT NULL,
    lap_start INTEGER,
    lap_end INTEGER,
    compound TEXT,
    tyre_age_at_start INTEGER,
    PRIMARY KEY (session_key, driver_number, stint_number)
);

-- Pit stops: one row per pit stop per driver per session
CREATE TABLE IF NOT EXISTS pit (
    session_key INTEGER NOT NULL REFERENCES races(session_key),
    driver_number INTEGER NOT NULL REFERENCES drivers(driver_number),
    lap_number INTEGER NOT NULL,
    pit_duration NUMERIC,
    date TIMESTAMPTZ,
    PRIMARY KEY (session_key, driver_number, lap_number)
);

-- Weather: track-wide, not per-driver — one row per timestamped reading
CREATE TABLE IF NOT EXISTS weather (
    session_key INTEGER NOT NULL REFERENCES races(session_key),
    date TIMESTAMPTZ NOT NULL,
    air_temperature NUMERIC,
    track_temperature NUMERIC,
    humidity NUMERIC,
    pressure NUMERIC,
    rainfall NUMERIC,
    wind_direction NUMERIC,
    wind_speed NUMERIC,
    PRIMARY KEY (session_key, date)
);

-- Positions: lap-by-lap (well, timestamp-by-timestamp) position per driver
CREATE TABLE IF NOT EXISTS positions (
    session_key INTEGER NOT NULL REFERENCES races(session_key),
    driver_number INTEGER NOT NULL REFERENCES drivers(driver_number),
    date TIMESTAMPTZ NOT NULL,
    position INTEGER,
    PRIMARY KEY (session_key, driver_number, date)
);

-- Race control: append-only event log, no natural unique key — insert-only
CREATE TABLE IF NOT EXISTS race_control (
    id SERIAL PRIMARY KEY,
    session_key INTEGER NOT NULL REFERENCES races(session_key),
    date TIMESTAMPTZ,
    category TEXT,
    flag TEXT,
    scope TEXT,
    sector INTEGER,
    driver_number INTEGER REFERENCES drivers(driver_number),
    message TEXT
);

-- Circuit facts edited from /admin: a row replaces that circuit's entry in
-- backend/shared/circuit_facts.json. Same table as backend/sql/16-circuit-facts.sql,
-- which also creates the role the API writes it with.
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
    CHECK (
        (lap_record_time IS NULL AND lap_record_driver IS NULL AND lap_record_year IS NULL)
        OR (lap_record_time IS NOT NULL AND lap_record_driver IS NOT NULL AND lap_record_year IS NOT NULL)
    )
);
