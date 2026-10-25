from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.auth import ClerkAuth
from app.config import Settings
from app.errors import LocalHostOnlyMiddleware, add_error_handlers
from app.questions.repository import JsonFileQuestionRepository
from app.questions.router import router as questions_router
from app.db import create_mysql_engine
from app.questions.sql import SqlQuestionStore
from app.takes.objects import InMemoryObjects, OciObjects
from app.takes.repository import InMemoryTakeStore
from app.takes.router import router as takes_router
from app.takes.sql import SqlTakeStore
from app.transcription.router import router as transcription_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Opened at startup, not in create_app, so importing app.main never touches storage.
    settings = app.state.settings
    app.state.transcripts = (
        OciObjects(settings.oci_namespace, settings.oci_bucket, settings.oci_region)
        if settings.oci_bucket
        else InMemoryObjects()
    )
    if settings.database_url is not None:
        # The schema comes from the Alembic migrations (backend/migrations), run before start.
        engine = create_mysql_engine(settings.database_url)
        app.state.questions = SqlQuestionStore(engine)
        app.state.takes = SqlTakeStore(engine)
        yield
        engine.dispose()
        return
    # A broken file raises QuestionFileError here and stops the server.
    app.state.questions = JsonFileQuestionRepository(settings.data_file)
    app.state.takes = InMemoryTakeStore()
    yield


def create_app(settings: Settings | None = None) -> FastAPI:
    # docs/api/openapi.yaml is the contract, so FastAPI's generated docs are turned off.
    app = FastAPI(
        title="umless", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan
    )
    app.state.settings = settings = settings or Settings.from_env()
    app.state.auth = (
        ClerkAuth(settings.clerk_issuer, settings.clerk_authorized_parties)
        if settings.clerk_issuer
        else None
    )
    add_error_handlers(app)
    app.add_middleware(LocalHostOnlyMiddleware)
    app.include_router(questions_router)
    app.include_router(takes_router)
    app.include_router(transcription_router)

    @app.get("/api/health")
    def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
