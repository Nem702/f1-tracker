"""Circuit facts: the model, the admin list/save routes and the race-weekend
read path, with every connection replaced by a recording fake — no Postgres,
no Jolpica, and the real race-weekend cache file never touched."""

import json
from datetime import datetime, timezone

import psycopg2
import pytest

from backend.api import main
from backend.api.circuit_facts import JSON_FACTS, CircuitFacts
from backend.api.main import app, get_db
from backend.tests.test_admin_auth import (  # noqa: F401 - client is a fixture
    ADMIN_ID,
    client,
    make_token,
)
from backend.tests.test_api import FakeConnection

NEXT_YEAR = datetime.now(timezone.utc).year + 1
UPDATED_AT = datetime(2026, 10, 3, 12, 0, tzinfo=timezone.utc)

VALID = {
    "length_km": 5.793,
    "turns": 11,
    "laps": 53,
    "first_gp": 1950,
    "lap_record": {"time": "1:21.046", "driver": "Rubens Barrichello", "year": 2004},
    "note": "Edited note.",
}
MONZA_ROW = {
    "circuit_id": "monza", "length_km": 5.793, "turns": 11, "laps": 53, "first_gp": 1950,
    "lap_record_time": "1:21.046", "lap_record_driver": "Rubens Barrichello", "lap_record_year": 2004,
    "note": "Edited note.", "updated_at": UPDATED_AT, "updated_by": ADMIN_ID,
}


class RecordingConnection(FakeConnection):
    """FakeConnection that also records each execute, answers fetchone and
    notes whether it was closed."""

    def __init__(self, rows):
        super().__init__(rows)
        self.executed = []
        self.closed = False

    def execute(self, sql, params=()):
        self.executed.append((sql, params))

    def fetchone(self):
        return self.rows[0] if self.rows else None

    def close(self):
        self.closed = True


def refuse(*args, **kwargs):
    raise AssertionError("this connection must not be used here")


@pytest.fixture
def api(client, monkeypatch):  # noqa: F811 - the imported fixture
    """The admin test client, with the read-only connection refused and the
    race-weekend cache isolated (memory and disk)."""
    main._rate_buckets.clear()
    monkeypatch.setattr(main, "get_readonly_connection", refuse)
    monkeypatch.setattr(main, "_race_weekend_cache", {"payload": None, "fetched_at": 0.0})
    return client


@pytest.fixture
def cache_file(monkeypatch, tmp_path):
    path = tmp_path / "race_weekend_cache.json"
    monkeypatch.setattr(main, "_RACE_WEEKEND_CACHE_FILE", path)
    return path


@pytest.fixture
def admin_conn(monkeypatch):
    conn = RecordingConnection([MONZA_ROW])
    monkeypatch.setattr(main, "get_admin_connection", lambda: conn)
    return conn


def auth(token=None):
    return {"Authorization": f"Bearer {token or make_token()}"}


def put(api, circuit_id, body, token=None):
    return api.put(f"/api/admin/circuit-facts/{circuit_id}", json=body, headers=auth(token))


def weekend(circuit_id):
    return {"round": 16, "circuit": {"circuit_id": circuit_id, "name": "x", "facts": JSON_FACTS[circuit_id]}}


# --- the model ---------------------------------------------------------------

@pytest.mark.parametrize("circuit_id", list(JSON_FACTS))
def test_every_json_entry_passes_the_model(circuit_id):
    CircuitFacts.model_validate(JSON_FACTS[circuit_id])


@pytest.mark.parametrize(("change", "loc"), [
    ({"length_km": 1.9}, ["length_km"]),
    ({"length_km": 8.1}, ["length_km"]),
    ({"turns": 4}, ["turns"]),
    ({"turns": 31}, ["turns"]),
    ({"turns": "11"}, ["turns"]),
    ({"laps": 39}, ["laps"]),
    ({"laps": 91}, ["laps"]),
    ({"first_gp": 1949}, ["first_gp"]),
    ({"first_gp": NEXT_YEAR}, ["first_gp"]),
    ({"note": "x" * 201}, ["note"]),
    ({"lap_record": {**VALID["lap_record"], "time": "1:60.000"}}, ["lap_record", "time"]),
    ({"lap_record": {**VALID["lap_record"], "time": "81.046"}}, ["lap_record", "time"]),
    ({"lap_record": {**VALID["lap_record"], "time": "1:21.04"}}, ["lap_record", "time"]),
    ({"lap_record": {**VALID["lap_record"], "year": 1949}}, ["lap_record", "year"]),
    ({"lap_record": {**VALID["lap_record"], "year": NEXT_YEAR}}, ["lap_record", "year"]),
    ({"lap_record": {**VALID["lap_record"], "driver": ""}}, ["lap_record", "driver"]),
    ({"lap_record": {**VALID["lap_record"], "driver": "x" * 61}}, ["lap_record", "driver"]),
    ({"lap_record": {**VALID["lap_record"], "team": "Ferrari"}}, ["lap_record", "team"]),
    ({"circuit_name": "Monza"}, ["circuit_name"]),
])
def test_invalid_body_is_422_and_never_written(api, admin_conn, change, loc):
    response = put(api, "monza", {**VALID, **change})
    assert response.status_code == 422
    assert [e["loc"] for e in response.json()["detail"]] == [["body", *loc]]
    assert admin_conn.executed == []


def test_missing_required_field_is_422(api, admin_conn):
    body = {k: v for k, v in VALID.items() if k != "turns"}
    response = put(api, "monza", body)
    assert response.status_code == 422
    assert [e["loc"] for e in response.json()["detail"]] == [["body", "turns"]]


def test_laps_and_lap_record_may_be_missing_or_null(api, admin_conn):
    body = {k: v for k, v in VALID.items() if k != "laps"} | {"lap_record": None}
    assert put(api, "monza", body).status_code == 200
    params = admin_conn.executed[-1][1]
    assert (params["laps"], params["lap_record_time"], params["lap_record_driver"], params["lap_record_year"]) == (
        None, None, None, None,
    )


# --- auth, 404, 503 ----------------------------------------------------------

@pytest.mark.parametrize("method", ["get", "put"])
def test_routes_require_admin(api, admin_conn, method):
    path = "/api/admin/circuit-facts" if method == "get" else "/api/admin/circuit-facts/monza"
    send = getattr(api, method)
    kwargs = {"json": VALID} if method == "put" else {}
    assert send(path, **kwargs).status_code == 401
    assert send(path, headers=auth(make_token(sub="not-an-admin")), **kwargs).status_code == 403
    assert admin_conn.executed == []


def test_auth_runs_before_validation(api, admin_conn):
    response = api.put("/api/admin/circuit-facts/monza", json={**VALID, "turns": 99})
    assert response.status_code == 401


def test_unknown_circuit_is_404(api, monkeypatch):
    monkeypatch.setattr(main, "get_admin_connection", refuse)
    response = put(api, "nurburgring", VALID)
    assert response.status_code == 404
    assert response.json()["detail"] == "Unknown circuit nurburgring"


def test_no_admin_url_is_503(api, monkeypatch, cache_file):
    # The real get_admin_connection: an unset variable must not reach psycopg2.
    monkeypatch.delenv("NEON_DATABASE_URL_ADMIN", raising=False)
    response = put(api, "monza", VALID)
    assert response.status_code == 503
    assert response.json()["detail"] == "Database unavailable"
    assert response.headers["cache-control"] == "no-store"
    assert not cache_file.exists()


def test_failed_upsert_is_503_and_closes(api, admin_conn, monkeypatch, cache_file):
    def broken(sql, params=()):
        raise psycopg2.errors.UndefinedTable('relation "circuit_facts" does not exist')

    monkeypatch.setattr(admin_conn, "execute", broken)
    response = put(api, "monza", VALID)
    assert response.status_code == 503
    assert response.json()["detail"] == "Database unavailable"
    assert admin_conn.closed
    assert not cache_file.exists()


# --- save --------------------------------------------------------------------

def test_save_upserts_through_the_admin_connection_as_the_token_sub(api, admin_conn, cache_file):
    response = put(api, "monza", VALID)
    assert response.status_code == 200
    sql, params = admin_conn.executed[-1]
    assert sql.strip().startswith("INSERT INTO circuit_facts")
    assert "ON CONFLICT (circuit_id) DO UPDATE" in sql
    assert params["circuit_id"] == "monza"
    assert params["updated_by"] == ADMIN_ID
    assert params["lap_record_driver"] == "Rubens Barrichello"
    assert admin_conn.closed
    assert response.json() == {
        "circuit_id": "monza", "source": "db", "facts": VALID,
        "updated_at": UPDATED_AT.isoformat(), "updated_by": ADMIN_ID,
    }


def test_save_updates_the_cached_payload_for_that_circuit(api, admin_conn, cache_file):
    payload = {"race_weekend": weekend("monza"), "fetched_at": "2026-10-03T00:00:00+00:00"}
    main._race_weekend_cache.update(payload=payload, fetched_at=123.0)

    assert put(api, "monza", VALID).status_code == 200

    assert main._race_weekend_cache["payload"]["race_weekend"]["circuit"]["facts"] == VALID
    assert main._race_weekend_cache["fetched_at"] == 123.0  # updated, not cleared
    on_disk = json.loads(cache_file.read_text(encoding="utf-8"))
    assert on_disk["race_weekend"]["circuit"]["facts"] == VALID


def test_save_leaves_a_cache_for_another_circuit_alone(api, admin_conn, cache_file):
    payload = {"race_weekend": weekend("spa"), "fetched_at": "2026-10-03T00:00:00+00:00"}
    main._race_weekend_cache.update(payload=payload, fetched_at=123.0)

    assert put(api, "monza", VALID).status_code == 200

    assert main._race_weekend_cache["payload"]["race_weekend"]["circuit"]["facts"] == JSON_FACTS["spa"]
    assert not cache_file.exists()


# --- admin list --------------------------------------------------------------

def test_list_marks_db_rows_and_keeps_json_order(api):
    app.dependency_overrides[get_db] = lambda: FakeConnection([MONZA_ROW])
    response = api.get("/api/admin/circuit-facts", headers=auth())
    assert response.status_code == 200
    items = response.json()
    assert [i["circuit_id"] for i in items] == list(JSON_FACTS)
    by_id = {i["circuit_id"]: i for i in items}
    assert by_id["monza"]["source"] == "db"
    assert by_id["monza"]["facts"] == VALID
    assert by_id["monza"]["updated_by"] == ADMIN_ID
    assert by_id["spa"] == {
        "circuit_id": "spa", "source": "json", "facts": JSON_FACTS["spa"], "updated_at": None, "updated_by": None,
    }


# --- public read path --------------------------------------------------------

@pytest.fixture
def fresh_weekend(api, monkeypatch, cache_file):
    """/api/race-weekend with Jolpica replaced: always a fresh fetch for monza."""
    monkeypatch.setattr(main, "get_race_weekend", lambda: weekend("monza"))
    return api


def test_read_path_prefers_the_db_row(fresh_weekend, monkeypatch):
    conn = RecordingConnection([MONZA_ROW])
    monkeypatch.setattr(main, "get_readonly_connection", lambda: conn)
    response = fresh_weekend.get("/api/race-weekend")
    assert response.status_code == 200
    assert response.json()["race_weekend"]["circuit"]["facts"] == VALID
    assert conn.closed


def test_read_path_omits_null_laps_like_the_json(fresh_weekend, monkeypatch):
    row = {**MONZA_ROW, "laps": None, "lap_record_time": None, "lap_record_driver": None, "lap_record_year": None}
    monkeypatch.setattr(main, "get_readonly_connection", lambda: RecordingConnection([row]))
    facts = fresh_weekend.get("/api/race-weekend").json()["race_weekend"]["circuit"]["facts"]
    assert list(facts) == list(JSON_FACTS["madring"])  # same keys, same order as Madring's entry
    assert facts["lap_record"] is None


def test_read_path_keeps_the_json_without_a_row(fresh_weekend, monkeypatch):
    monkeypatch.setattr(main, "get_readonly_connection", lambda: RecordingConnection([]))
    response = fresh_weekend.get("/api/race-weekend")
    assert response.json()["race_weekend"]["circuit"]["facts"] == JSON_FACTS["monza"]


def test_read_path_keeps_the_json_on_a_db_error(fresh_weekend, monkeypatch):
    def broken():
        raise KeyError("NEON_DATABASE_URL_RO")

    monkeypatch.setattr(main, "get_readonly_connection", broken)
    response = fresh_weekend.get("/api/race-weekend")
    assert response.status_code == 200
    assert response.json()["race_weekend"]["circuit"]["facts"] == JSON_FACTS["monza"]
