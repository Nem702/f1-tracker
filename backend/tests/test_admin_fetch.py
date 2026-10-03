"""/api/admin/fetch, /runs and /fetch/enable, with GitHub replaced by a
recorder — no network, no token beyond a fake one."""

import logging

import pytest
import requests

from backend.api import github_actions, main
from backend.tests.test_admin_auth import client, make_token  # noqa: F401 - client is a fixture

FAKE_TOKEN = "github_pat_FAKE_TOKEN_must_never_leak"
WORKFLOW_URL = "https://api.github.com/repos/Nem702/f1-tracker/actions/workflows/fetch.yml"
ROUTES = [("post", "/api/admin/fetch"), ("get", "/api/admin/runs"), ("post", "/api/admin/fetch/enable")]


def gh_response(status, body=None):
    response = requests.Response()
    response.status_code = status
    response._content = b"" if body is None else requests.compat.json.dumps(body).encode()
    return response


class FakeGitHub:
    """Stands in for requests.request: records each call and answers by
    (method, url suffix); an Exception value is raised instead."""

    def __init__(self, answers):
        self.answers = answers
        self.calls = []

    def __call__(self, method, url, **kwargs):
        self.calls.append({"method": method, "url": url, **kwargs})
        answer = self.answers[(method, url.removeprefix(WORKFLOW_URL))]
        if isinstance(answer, Exception):
            raise answer
        return answer


ACTIVE = {
    ("GET", ""): gh_response(200, {"id": 1, "name": "fetch-f1-data", "state": "active"}),
    ("POST", "/dispatches"): gh_response(204),
    ("PUT", "/enable"): gh_response(204),
    ("GET", "/runs"): gh_response(200, {"total_count": 1, "workflow_runs": [{
        "id": 42, "status": "completed", "conclusion": "success", "event": "workflow_dispatch",
        "created_at": "2026-10-03T10:00:00Z", "html_url": "https://github.com/Nem702/f1-tracker/actions/runs/42",
        "head_sha": "abc", "actor": {"login": "someone"},
    }]}),
}


@pytest.fixture
def github(monkeypatch, client):  # noqa: F811 - the imported fixture
    """Configured token plus a fake GitHub; returns (client, fake) — set
    fake.answers per test to change what GitHub says."""
    monkeypatch.setenv("GITHUB_ACTIONS_TOKEN", FAKE_TOKEN)
    fake = FakeGitHub(dict(ACTIVE))
    monkeypatch.setattr(github_actions.requests, "request", fake)
    main._rate_buckets.clear()  # many requests from one test client
    return client, fake


def call(api, method, path, token=None):
    headers = {"Authorization": f"Bearer {token or make_token()}"}
    return getattr(api, method)(path, headers=headers)


@pytest.mark.parametrize(("method", "path"), ROUTES)
def test_routes_require_admin(github, method, path):
    api, fake = github
    assert getattr(api, method)(path).status_code == 401
    assert call(api, method, path, make_token(sub="not-an-admin")).status_code == 403
    assert fake.calls == []


def test_dispatch_sends_main_to_the_fixed_workflow(github):
    api, fake = github
    response = call(api, "post", "/api/admin/fetch")
    assert response.status_code == 202
    assert response.headers["cache-control"] == "no-store"
    dispatch = fake.calls[-1]
    assert (dispatch["method"], dispatch["url"]) == ("POST", f"{WORKFLOW_URL}/dispatches")
    assert dispatch["json"] == {"ref": "main"}
    assert dispatch["timeout"] == 10
    assert dispatch["headers"] == {
        "Authorization": f"Bearer {FAKE_TOKEN}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def test_runs_returns_state_and_trimmed_runs(github):
    api, fake = github
    response = call(api, "get", "/api/admin/runs")
    assert response.status_code == 200
    assert response.json() == {"state": "active", "runs": [{
        "id": 42, "status": "completed", "conclusion": "success", "event": "workflow_dispatch",
        "created_at": "2026-10-03T10:00:00Z", "html_url": "https://github.com/Nem702/f1-tracker/actions/runs/42",
    }]}
    assert fake.calls[-1]["params"] == {"per_page": 10}


def test_enable_sends_put(github):
    api, fake = github
    response = call(api, "post", "/api/admin/fetch/enable")
    assert response.status_code == 200
    assert [(c["method"], c["url"]) for c in fake.calls] == [("PUT", f"{WORKFLOW_URL}/enable")]


@pytest.mark.parametrize("value", [None, "", "  "], ids=["unset", "empty", "blank"])
@pytest.mark.parametrize(("method", "path"), ROUTES)
def test_unconfigured_token_is_503(github, monkeypatch, method, path, value):
    api, fake = github
    if value is None:
        monkeypatch.delenv("GITHUB_ACTIONS_TOKEN")
    else:
        monkeypatch.setenv("GITHUB_ACTIONS_TOKEN", value)
    response = call(api, method, path)
    assert response.status_code == 503
    assert response.json()["detail"] == "GitHub Actions not configured"
    assert fake.calls == []


def test_disabled_workflow_is_409_and_not_dispatched(github):
    api, fake = github
    fake.answers[("GET", "")] = gh_response(200, {"state": "disabled_manually"})
    response = call(api, "post", "/api/admin/fetch")
    assert response.status_code == 409
    assert "disabled_manually" in response.json()["detail"]
    assert [c["method"] for c in fake.calls] == ["GET"]


@pytest.mark.parametrize("failure", [
    gh_response(500, {"message": "GITHUB_RAW_BODY internal detail"}),
    gh_response(200, None),  # not JSON
    requests.Timeout("GITHUB_RAW_BODY timed out"),
    requests.ConnectionError("GITHUB_RAW_BODY refused"),
], ids=["http-500", "non-json", "timeout", "connection"])
def test_github_failure_is_502_without_its_body(github, failure):
    api, fake = github
    fake.answers[("GET", "")] = failure
    response = call(api, "get", "/api/admin/runs")
    assert response.status_code == 502
    assert response.json() == {"detail": "GitHub request failed"}


def test_dispatch_failure_is_502(github):
    api, fake = github
    fake.answers[("POST", "/dispatches")] = gh_response(422, {"message": "GITHUB_RAW_BODY"})
    response = call(api, "post", "/api/admin/fetch")
    assert response.status_code == 502
    assert "GITHUB_RAW_BODY" not in response.text


def test_token_never_in_a_response_or_log(github, caplog):
    api, fake = github
    caplog.set_level(logging.DEBUG)
    bodies = [call(api, m, p).text for m, p in ROUTES]
    fake.answers[("GET", "")] = gh_response(401, {"message": f"Bad credentials {FAKE_TOKEN}"})
    fake.answers[("PUT", "/enable")] = requests.Timeout(f"timed out with {FAKE_TOKEN}")
    bodies += [call(api, m, p).text for m, p in ROUTES]
    assert len(fake.calls) > 0 and caplog.records  # the paths above really ran and logged
    assert not [b for b in bodies if FAKE_TOKEN in b]
    assert not [r for r in caplog.records if FAKE_TOKEN in r.getMessage()]
