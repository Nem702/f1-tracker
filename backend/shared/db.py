"""
Postgres connection handling. Reads credentials from .env so they're
never hardcoded in source.

Three connection strings, one per kind of caller. The fetch pipeline upserts
(backend/pipeline/store.py) and genuinely needs write access. Every API
endpoint reads through a read-only Postgres role, so a bug or a compromise
there cannot write to the database at all — the boundary is enforced by
Postgres rather than by convention (see DEPLOYMENT.md for that role's grants).
The one exception is the admin-only circuit-facts save, which connects as a
role that can write the circuit_facts table and nothing else
(backend/sql/16-circuit-facts.sql).
"""

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()


def get_connection():
    """Read-write — the fetch pipeline only, never anything under backend/api/."""
    return psycopg2.connect(os.environ["NEON_DATABASE_URL"])


def get_readonly_connection():
    """Read-only, for the API.

    Deliberately no fallback to NEON_DATABASE_URL: a misconfigured deploy has
    to fail loudly, because the quiet alternative is serving the entire API on
    the read-write connection — the exact thing this split exists to prevent.
    Read inside the function rather than at import time, since the pipeline
    imports this module and has no NEON_DATABASE_URL_RO of its own.
    """
    return psycopg2.connect(os.environ["NEON_DATABASE_URL_RO"])


def get_admin_connection():
    """Write access to circuit_facts only, for the admin save route only.

    No fallback to either other URL, for the same reason as above: an unset
    NEON_DATABASE_URL_ADMIN must fail (the route turns it into a 503), never
    quietly borrow a broader role.
    """
    return psycopg2.connect(os.environ["NEON_DATABASE_URL_ADMIN"])
