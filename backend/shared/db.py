"""
Postgres connection handling. Reads credentials from .env so they're
never hardcoded in source.

Two connection strings rather than one, because the two callers have opposite
needs: the fetch pipeline upserts (backend/pipeline/store.py) and genuinely
needs write access, while every endpoint in the API is a SELECT. Giving the
public-facing service its own read-only Postgres role means a bug or a
compromise there cannot write to the database at all — the boundary is
enforced by Postgres rather than by convention. See DEPLOYMENT.md for the
role's grants.
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
