"""Sign-in: who is calling, from their Clerk session token (docs/adr/0003-clerk-auth.md)."""

import base64
import binascii
import logging
from typing import Callable

import jwt
from fastapi import Request

from app.errors import ApiError

logger = logging.getLogger(__name__)

LOCAL_USER = "local"
# Small clock differences between Clerk and this server.
LEEWAY_SECONDS = 5


def unauthorized() -> ApiError:
    return ApiError(401, "unauthorized", "Sign in to continue.")


def clerk_issuer(publishable_key: str) -> str:
    """Clerk's Frontend API URL, which issues the tokens, from a pk_test_/pk_live_ key.

    The part after the prefix is base64 of "<frontend api host>$".
    """
    prefix, _, encoded = publishable_key.strip().partition("_test_")
    if not encoded:
        prefix, _, encoded = publishable_key.strip().partition("_live_")
    try:
        decoded = base64.b64decode(encoded + "=" * (-len(encoded) % 4), validate=True).decode()
    except (binascii.Error, UnicodeDecodeError):
        decoded = ""
    if prefix != "pk" or not decoded.endswith("$") or len(decoded) < 2:
        raise ValueError("CLERK_PUBLISHABLE_KEY is not a Clerk publishable key (pk_test_... or pk_live_...)")
    return f"https://{decoded[:-1]}"


class ClerkAuth:
    """Verifies Clerk session tokens (RS256 JWTs) against the instance's published keys."""

    def __init__(
        self,
        issuer: str,
        authorized_parties: tuple[str, ...],
        signing_key: Callable[[str], object] | None = None,
    ) -> None:
        self._issuer = issuer
        self._authorized_parties = authorized_parties
        if signing_key is None:
            # Keys are fetched once and cached; an unknown key id triggers one refetch.
            jwks = jwt.PyJWKClient(f"{issuer}/.well-known/jwks.json", lifespan=3600, timeout=5)
            signing_key = lambda token: jwks.get_signing_key_from_jwt(token).key  # noqa: E731
        self._signing_key = signing_key

    def user_id(self, token: str) -> str:
        try:
            claims = jwt.decode(
                token,
                self._signing_key(token),
                algorithms=["RS256"],
                issuer=self._issuer,
                leeway=LEEWAY_SECONDS,
                options={"require": ["exp", "iat", "iss", "sub"]},
            )
        except jwt.PyJWKClientConnectionError as exc:
            logger.warning("Couldn't fetch Clerk's signing keys: %s", exc)
            raise unauthorized() from None
        except jwt.PyJWTError:
            raise unauthorized() from None
        # azp is the origin the token was issued to; it stops tokens minted for other sites
        # on the same Clerk instance from being used here.
        if claims.get("azp") not in self._authorized_parties:
            raise unauthorized()
        if not isinstance(claims["sub"], str) or not claims["sub"]:
            raise unauthorized()
        return claims["sub"]


def get_user_id(request: Request) -> str:
    """Whose questions a request reads and changes: the signed-in Clerk user.

    Without Clerk configured (local, single-user use) everyone is the one local user.
    A sync dependency on purpose: fetching Clerk's keys blocks, so it runs in the threadpool.
    """
    auth: ClerkAuth | None = request.app.state.auth
    if auth is None:
        return LOCAL_USER
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise unauthorized()
    return auth.user_id(token.strip())
