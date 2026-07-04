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
    name TEXT NOT NULL
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