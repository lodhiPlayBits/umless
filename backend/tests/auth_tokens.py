"""Clerk-style session tokens for tests, signed with a throwaway RSA key."""

import time

import jwt
from cryptography.hazmat.primitives.asymmetric import rsa

from app.auth import ClerkAuth

# The publishable key from the Clerk dashboard quickstart (public by design).
PUBLISHABLE_KEY = "pk_test_c3RhYmxlLWZpc2gtNDkzMC5jbGVyay5hY2NvdW50cy5kZXYk"
ISSUER = "https://stable-fish-4930.clerk.accounts.dev"
SITE = "https://umless.in"
KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def make_token(sub="user_alice", key=KEY, lifetime=60, **overrides):
    """A token as Clerk issues it; an override of None leaves that claim out."""
    now = int(time.time())
    claims = {"iss": ISSUER, "sub": sub, "azp": SITE, "iat": now, "nbf": now, "exp": now + lifetime}
    claims.update(overrides)
    claims = {name: value for name, value in claims.items() if value is not None}
    return jwt.encode(claims, key, algorithm="RS256")


def require_sign_in(app):
    """Turn on sign-in for an app, trusting tokens from make_token()."""
    app.state.auth = ClerkAuth(ISSUER, (SITE,), signing_key=lambda _: KEY.public_key())
    return app
