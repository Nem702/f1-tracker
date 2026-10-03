"""
GitHub Actions calls behind /api/admin/fetch*: start the fetch workflow, list
its recent runs, read its state, re-enable it.

Repo, workflow file and ref are fixed here; nothing in a request chooses
them. GITHUB_ACTIONS_TOKEN (a fine-grained token: this repo only, Actions
read/write) is read per request, like admin_auth.py reads its env, and is
unset → 503. The token is never logged or returned, and neither is GitHub's
response body: any GitHub error or timeout becomes a short 502.
"""

import os

import requests
from fastapi import HTTPException

from backend.shared.logger import logger

_REPO = "Nem702/f1-tracker"
_WORKFLOW = "fetch.yml"
_REF = "main"
_TIMEOUT_SECONDS = 10
_BASE_URL = f"https://api.github.com/repos/{_REPO}/actions/workflows/{_WORKFLOW}"
_RUN_FIELDS = ("id", "status", "conclusion", "event", "created_at", "html_url")


def _call(method: str, path: str = "", **kwargs) -> requests.Response:
    token = os.environ.get("GITHUB_ACTIONS_TOKEN", "").strip()
    if not token:
        logger.error("GitHub Actions not configured - GITHUB_ACTIONS_TOKEN is unset")
        raise HTTPException(status_code=503, detail="GitHub Actions not configured")
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    try:
        response = requests.request(method, f"{_BASE_URL}{path}", headers=headers, timeout=_TIMEOUT_SECONDS, **kwargs)
    except requests.RequestException as e:
        # The exception type only: its message can echo the request.
        logger.error("GitHub %s %s failed: %s", method, path or "/", type(e).__name__)
        raise HTTPException(status_code=502, detail="GitHub request failed")
    if not response.ok:
        logger.error("GitHub %s %s returned %s", method, path or "/", response.status_code)
        raise HTTPException(status_code=502, detail="GitHub request failed")
    return response


def _json(response: requests.Response) -> dict:
    try:
        return response.json()
    except ValueError:
        logger.error("GitHub returned a non-JSON body (status %s)", response.status_code)
        raise HTTPException(status_code=502, detail="GitHub request failed")


def workflow_state() -> str:
    """'active', or why it isn't: disabled_manually, disabled_inactivity, ..."""
    return str(_json(_call("GET")).get("state"))


def list_runs() -> list[dict]:
    runs = _json(_call("GET", "/runs", params={"per_page": 10})).get("workflow_runs", [])
    return [{k: run.get(k) for k in _RUN_FIELDS} for run in runs]


def dispatch() -> None:
    # 204 normally; any 2xx is a success (GitHub can also answer 200 with run details).
    _call("POST", "/dispatches", json={"ref": _REF})


def enable() -> None:
    _call("PUT", "/enable")
