"""API endpoints through TestClient, with get_db swapped for a fake
connection — no Postgres, no Jolpica."""

import pytest
from fastapi.testclient import TestClient

from backend.api import main
from backend.api.main import app, get_db


class FakeConnection:
    """Just enough of a psycopg2 connection for query(): every SELECT
    returns the same canned rows."""

    def __init__(self, rows):
        self.rows = rows

    def cursor(self, cursor_factory=None):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def execute(self, sql, params=()):
        pass

    def fetchall(self):
        return self.rows


@pytest.fixture
def client_with_rows():
    """Returns a factory: client_with_rows([...]) gives a TestClient whose
    get_db yields a FakeConnection over those rows."""
    def make(rows):
        app.dependency_overrides[get_db] = lambda: FakeConnection(rows)
        return TestClient(app)
    yield make
    app.dependency_overrides.clear()


def test_health():
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_races_returns_db_rows(client_with_rows):
    rows = [{"session_key": 11300, "location": "Sepang", "has_laps": True}]
    response = client_with_rows(rows).get("/api/races")
    assert response.status_code == 200
    assert response.json() == rows


def test_official_result_caches_only_a_published_race(client_with_rows, monkeypatch):
    # Never touch the real backend/.official_result_cache.json.
    monkeypatch.setattr(main, "_official_result_cache", {})
    monkeypatch.setattr(main, "_save_official_result_cache", lambda: None)
    monkeypatch.setattr(
        main, "find_jolpica_round",
        lambda year, date_start: {"season": 2026, "round": 18, "race_name": "Malaysian GP", "has_sprint": False},
    )
    published = {"race": []}
    calls = []

    def fake_official_result(season, round_, has_sprint):
        calls.append(round_)
        return {"race": published["race"], "qualifying": [], "sprint": None}

    monkeypatch.setattr(main, "get_official_result", fake_official_result)
    client = client_with_rows([{"date_start": "2026-10-04T07:00:00+00:00", "year": 2026}])

    # Not published yet: served, not cached, so the next request asks again.
    for _ in range(2):
        response = client.get("/api/races/11300/official-result")
        assert response.status_code == 200
        assert response.json()["official_result"]["race"] == []
    assert len(calls) == 2
    assert main._official_result_cache == {}

    # Published: cached, so a repeat request doesn't fetch again.
    published["race"] = [{"position": 1}]
    client.get("/api/races/11300/official-result")
    client.get("/api/races/11300/official-result")
    assert len(calls) == 3
    assert "11300" in main._official_result_cache
