"""require_admin and the /api/admin routes, against a locally generated
Ed25519 key served through a real PyJWKClient whose fetch is stubbed — no
network, no Neon."""

import time

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from fastapi.testclient import TestClient

from backend.api import admin_auth
from backend.api.main import app, get_db
from backend.tests.test_api import FakeConnection

AUTH_URL = "https://auth.example.test/neondb/auth"
ORIGIN = "https://auth.example.test"
ADMIN_ID = "admin-user-id"
KID = "test-kid"

_signing_key = Ed25519PrivateKey.generate()
_jwks = {"keys": [{**jwt.algorithms.OKPAlgorithm.to_jwk(_signing_key.public_key(), as_dict=True), "kid": KID}]}


def make_token(key=_signing_key, algorithm="EdDSA", kid=KID, **overrides):
    now = int(time.time())
    claims = {"sub": ADMIN_ID, "email": "admin@example.test", "iss": ORIGIN, "aud": ORIGIN, "iat": now, "exp": now + 900}
    claims.update(overrides)
    headers = {"kid": kid} if kid else None
    return jwt.encode(claims, key, algorithm=algorithm, headers=headers)


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("NEON_AUTH_URL", AUTH_URL)
    monkeypatch.setenv("ADMIN_USER_IDS", f"someone-else, {ADMIN_ID}")
    admin_auth._jwks_client.cache_clear()
    jwks_client = admin_auth._jwks_client(f"{AUTH_URL}/.well-known/jwks.json")
    monkeypatch.setattr(jwks_client, "fetch_data", lambda: _jwks)
    yield TestClient(app)
    admin_auth._jwks_client.cache_clear()
    app.dependency_overrides.clear()


def get_me(client, token=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    return client.get("/api/admin/me", headers=headers)


def test_valid_admin_token(client):
    response = get_me(client, make_token())
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    body = response.json()
    assert body["user_id"] == ADMIN_ID
    assert body["email"] == "admin@example.test"
    assert [c["check"] for c in body["checks"]] == [
        "algorithm", "signature", "issuer", "audience", "expiry", "allowlist",
    ]


@pytest.mark.parametrize(("token", "reason"), [
    (None, "Missing bearer token"),
    (make_token(key=Ed25519PrivateKey.generate()), "Bad signature"),
    (make_token(exp=int(time.time()) - 120), "Token expired"),  # beyond the 30s leeway
    (make_token(iss="https://evil.example.test"), "Wrong issuer"),
    (make_token(aud="https://evil.example.test"), "Wrong audience"),
    (make_token(key="a-shared-secret-at-least-32-bytes-long", algorithm="HS256"), "Algorithm must be EdDSA"),
    (jwt.encode({"sub": ADMIN_ID, "iss": ORIGIN, "aud": ORIGIN}, None, algorithm="none"), "Algorithm must be EdDSA"),
], ids=["missing", "bad-signature", "expired", "wrong-iss", "wrong-aud", "hs256", "none"])
def test_rejected_tokens_are_401(client, token, reason):
    response = get_me(client, token)
    assert response.status_code == 401
    assert response.json()["detail"] == reason
    assert response.headers["cache-control"] == "no-store"


def test_valid_token_not_on_allowlist_is_403(client):
    assert get_me(client, make_token(sub="not-an-admin")).status_code == 403


@pytest.mark.parametrize("unset", ["NEON_AUTH_URL", "ADMIN_USER_IDS"])
def test_unconfigured_is_503(client, monkeypatch, unset):
    monkeypatch.setenv(unset, " ")
    assert get_me(client, make_token()).status_code == 503


def test_status_returns_counts_and_latest_race(client):
    row = {"session_key": 11300, "location": "Sepang", "country_name": "Malaysia", "laps": 1100}
    app.dependency_overrides[get_db] = lambda: FakeConnection([row])
    response = client.get("/api/admin/status", headers={"Authorization": f"Bearer {make_token()}"})
    assert response.status_code == 200
    assert response.json()["latest_race"] == row
