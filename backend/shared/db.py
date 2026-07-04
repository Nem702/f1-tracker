"""
Postgres connection handling. Reads credentials from .env so they're
never hardcoded in source. This is all the API needs from the database
layer — the write path (upserts) lives in backend/pipeline/store.py,
since only the fetch pipeline ever writes.
"""

import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()


def get_connection():
    return psycopg2.connect(os.environ["NEON_DATABASE_URL"])
