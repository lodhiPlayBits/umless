from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.config import Settings
from app.errors import LocalHostOnlyMiddleware, add_error_handlers
from app.questions.repository import JsonFileQuestionRepository
from app.questions.router import router as questions_router
from app.transcription.router import router as transcription_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Loaded at startup, not in create_app, so importing app.main never reads the data file.
    # A broken file raises QuestionFileError here and stops the server.
    app.state.questions = JsonFileQuestionRepository(app.state.settings.data_file)
    yield


def create_app(settings: Settings | None = None) -> FastAPI:
    # docs/api/openapi.yaml is the contract, so FastAPI's generated docs are turned off.
    app = FastAPI(
        title="umless", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan
    )
    app.state.settings = settings or Settings.from_env()
    add_error_handlers(app)
    app.add_middleware(LocalHostOnlyMiddleware)
    app.include_router(questions_router)
    app.include_router(transcription_router)

    @app.get("/api/health")
    def health() -> dict:
        return {"status": "ok"}

    return app


app = create_app()
