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