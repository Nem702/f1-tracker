"""
Admin auth for /api/admin/*: verifies a Neon Auth (Better Auth) JWT and
checks its user against an allowlist.

The browser signs in with Neon Auth and sends `Authorization: Bearer <jwt>`.
Neon Auth signs with EdDSA (Ed25519) and publishes its keys at
<NEON_AUTH_URL>/.well-known/jwks.json; `iss` and `aud` are both the origin of
NEON_AUTH_URL (scheme + host, no path), `sub` is the user ID.

Fails closed: with NEON_AUTH_URL or ADMIN_USER_IDS unset or empty, every
admin route is a 503 rather than an open door. Both are read per request
(like get_readonly_connection), so a misconfigured deploy can't be cached
into a working state. Tokens are never logged — only the rejection reason.
"""

import os
from functools import lru_cache
from urllib.parse import urlsplit

import jwt
from fastapi import HTTPException, Request

from backend.shared.logger import logger

_ALGORITHM = "EdDSA"
_LEEWAY_SECONDS = 30


@lru_cache(maxsize=4)
def _jwks_client(jwks_url: str) -> jwt.PyJWKClient:
    """One client per URL for the process lifetime. It caches the key set
    (5 min) and, on an unknown kid, refetches at most once per cooldown —
    enough for a key rotation without letting junk tokens hammer Neon."""
    return jwt.PyJWKClient(jwks_url, timeout=10)


def _unauthorized(reason: str):
    logger.info("admin auth rejected: %s", reason)
    return HTTPException(status_code=401, detail=reason, headers={"WWW-Authenticate": "Bearer"})


def require_admin(request: Request) -> dict:
    """FastAPI dependency. Returns {"claims": ..., "checks": [...]}, where
    checks lists each verification step that passed, for /api/admin/me."""
    auth_url = os.environ.get("NEON_AUTH_URL", "").strip()
    admin_ids = {i.strip() for i in os.environ.get("ADMIN_USER_IDS", "").split(",") if i.strip()}
    if not auth_url or not admin_ids:
        logger.error("admin auth not configured - NEON_AUTH_URL and ADMIN_USER_IDS must both be set")
        raise HTTPException(status_code=503, detail="Admin auth not configured")
    parts = urlsplit(auth_url)
    origin = f"{parts.scheme}://{parts.netloc}"

    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise _unauthorized("Missing bearer token")
    token = token.strip()

    # Algorithm first, from the unverified header: HS256 and `none` tokens
    # are refused here, before any key lookup could be steered by them.
    try:
        header = jwt.get_unverified_header(token)
    except jwt.DecodeError:
        raise _unauthorized("Malformed token")
    if header.get("alg") != _ALGORITHM:
        raise _unauthorized(f"Algorithm must be {_ALGORITHM}")
    kid = header.get("kid")
    if not kid:
        raise _unauthorized("Token has no kid")

    try:
        signing_key = _jwks_client(f"{auth_url.rstrip('/')}/.well-known/jwks.json").get_signing_key(kid)
    except jwt.PyJWKClientConnectionError:
        logger.exception("admin auth: JWKS fetch failed")
        raise HTTPException(status_code=503, detail="Auth provider unavailable")
    except jwt.PyJWKClientError:
        raise _unauthorized("Unknown signing key")
    except Exception:
        # An unparseable JWKS, a non-JSON response, a malformed NEON_AUTH_URL:
        # the provider side is broken, not the caller's token.
        logger.exception("admin auth: JWKS unusable")
        raise HTTPException(status_code=503, detail="Auth provider unavailable")

    try:
        claims = jwt.decode(
            token,
            # The PyJWK, not its raw key: PyJWT then also checks the token's
            # alg against the key's own type.
            signing_key,
            algorithms=[_ALGORITHM],
            issuer=origin,
            audience=origin,
            leeway=_LEEWAY_SECONDS,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
        )
    except jwt.InvalidSignatureError:
        raise _unauthorized("Bad signature")
    except jwt.ExpiredSignatureError:
        raise _unauthorized("Token expired")
    except jwt.InvalidIssuerError:
        raise _unauthorized("Wrong issuer")
    except jwt.InvalidAudienceError:
        raise _unauthorized("Wrong audience")
    except jwt.MissingRequiredClaimError as e:
        raise _unauthorized(f"Missing claim: {e.claim}")
    except jwt.PyJWTError:
        raise _unauthorized("Invalid token")

    # One decode() verifies signature, iss, aud and exp together, so reaching
    # this line means every check below passed.
    checks = [
        {"check": "algorithm", "detail": f"{_ALGORITHM}, kid {kid}"},
        {"check": "signature", "detail": "Ed25519 key from the Neon Auth JWKS"},
        {"check": "issuer", "detail": claims["iss"]},
        {"check": "audience", "detail": claims["aud"]},
        {"check": "expiry", "detail": f"exp {claims['exp']}, leeway {_LEEWAY_SECONDS}s"},
    ]
    if claims["sub"] not in admin_ids:
        logger.info("admin auth: valid token for non-admin user")
        raise HTTPException(status_code=403, detail="Not an admin")
    checks.append({"check": "allowlist", "detail": "sub is in ADMIN_USER_IDS"})
    return {"claims": claims, "checks": checks}
