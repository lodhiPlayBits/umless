import logging
from contextlib import asynccontextmanager

import redis.asyncio
from fastapi import FastAPI

from app.auth import ClerkAuth
from app.billing.razorpay import Razorpay
from app.billing.router import router as billing_router
from app.billing.router import webhook_router as billing_webhook_router
from app.billing.sql import SqlBillingStore
from app.billing.store import InMemoryBillingStore
from app.config import Settings
from app.errors import LocalHostOnlyMiddleware, add_error_handlers
from app.questions.repository import JsonFileQuestionRepository
from app.questions.router import router as questions_router
from app.db import create_mysql_engine
from app.contact.mailer import ResendMailer
from app.contact.router import router as contact_router
from app.client_errors.router import router as client_errors_router
from app.free_cap import InMemoryFreeTimeCap, RedisFreeTimeCap
from app.limits import InMemoryLimits, RedisLimits
from app.log import start_logging
from app.monitoring import start_sentry
from app.questions.sql import SqlQuestionStore
from app.takes.objects import InMemoryObjects, OciObjects
from app.takes.repository import InMemoryTakeStore
from app.takes.router import router as takes_router
from app.takes.sql import SqlTakeStore
from app.transcription.duration import audio_seconds
from app.transcription.router import router as transcription_router

logger = logging.getLogger(__name__)

# Contact form messages per user per hour.
CONTACT_MESSAGES_PER_HOUR = 5
# Browser crash reports per user per hour (the frontend also caps them per page load).
CLIENT_ERRORS_PER_HOUR = 30


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Opened at startup, not in create_app, so importing app.main never touches storage.
    settings = app.state.settings
    stop_logging = start_logging(settings.log_level) if settings.log_level else None
    redis_client = None
    if settings.redis_url:
        # from_url doesn't connect; the first command does, and RedisLimits fails open.
        redis_client = redis.asyncio.from_url(settings.redis_url, socket_timeout=2, socket_connect_timeout=2)
        app.state.limits = RedisLimits(redis_client, settings.transcriptions_per_hour)
        app.state.contact_limits = RedisLimits(redis_client, CONTACT_MESSAGES_PER_HOUR, prefix="umless:contact")
        app.state.client_error_limits = RedisLimits(
            redis_client, CLIENT_ERRORS_PER_HOUR, prefix="umless:client-errors"
        )
        app.state.free_cap = RedisFreeTimeCap(redis_client, settings.free_minutes_per_day * 60)
        logger.info("Transcription limits in Redis, %d per user per hour", settings.transcriptions_per_hour)
    else:
        logger.info("Transcription limits in memory, %d per user per hour", settings.transcriptions_per_hour)
    try:
        async with _storage(app, settings):
            yield
    finally:
        if redis_client is not None:
            await redis_client.aclose()
        logger.info("Shutting down")
        if stop_logging is not None:
            stop_logging()


@asynccontextmanager
async def _storage(app: FastAPI, settings: Settings):
    app.state.transcripts = (
        OciObjects(settings.oci_namespace, settings.oci_bucket, settings.oci_region)
        if settings.oci_bucket
        else InMemoryObjects()
    )
    metered = app.state.razorpay is not None
    if settings.database_url is not None:
        # The schema comes from the Alembic migrations (backend/migrations), run before start.
        engine = create_mysql_engine(settings.database_url)
        app.state.questions = SqlQuestionStore(engine)
        app.state.takes = SqlTakeStore(engine)
        app.state.billing = SqlBillingStore(engine) if metered else None
        yield
        engine.dispose()
        return
    # A broken file raises QuestionFileError here and stops the server.
    app.state.questions = JsonFileQuestionRepository(settings.data_file)
    app.state.takes = InMemoryTakeStore()
    app.state.billing = InMemoryBillingStore() if metered else None
    yield


def create_app(settings: Settings | None = None) -> FastAPI:
    # docs/api/openapi.yaml is the contract, so FastAPI's generated docs are turned off.
    app = FastAPI(
        title="umless", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan
    )
    app.state.settings = settings = settings or Settings.from_env()
    if settings.sentry_dsn:
        # Before the first request builds the middleware stack, which the FastAPI integration hooks.
        start_sentry(settings.sentry_dsn, settings.sentry_environment)
    app.state.auth = (
        ClerkAuth(settings.clerk_issuer, settings.clerk_authorized_parties)
        if settings.clerk_issuer
        else None
    )
    app.state.razorpay = (
        Razorpay(settings.razorpay_key_id, settings.razorpay_key_secret, settings.razorpay_webhook_secret)
        if settings.razorpay_key_id
        else None
    )
    # Unmetered until the lifespan sets a store (only with Razorpay configured).
    app.state.billing = None
    # In memory until the lifespan connects Redis (only with REDIS_URL set).
    app.state.limits = InMemoryLimits(settings.transcriptions_per_hour)
    app.state.contact_limits = InMemoryLimits(CONTACT_MESSAGES_PER_HOUR)
    app.state.client_error_limits = InMemoryLimits(CLIENT_ERRORS_PER_HOUR)
    app.state.free_cap = InMemoryFreeTimeCap(settings.free_minutes_per_day * 60)
    # Measures each recording before Deepgram on metered servers; tests swap in a fixed length.
    app.state.measure_audio = audio_seconds
    app.state.mailer = (
        ResendMailer(settings.resend_api_key, settings.contact_from) if settings.resend_api_key else None
    )
    add_error_handlers(app)
    app.add_middleware(LocalHostOnlyMiddleware)
    app.include_router(questions_router)
    app.include_router(takes_router)
    app.include_router(billing_router)
    app.include_router(billing_webhook_router)
    app.include_router(transcription_router)
    app.include_router(contact_router)
    app.include_router(client_errors_router)

    @app.get("/api/health")
    def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
