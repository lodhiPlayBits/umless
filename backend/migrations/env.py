"""Alembic environment: migrates the MySQL database the app is configured for."""

from logging.config import fileConfig

from alembic import context

from app.config import Settings
from app.db import create_mysql_engine, metadata

# Imported for their tables, which register themselves in metadata.
import app.questions.sql  # noqa: E402,F401
import app.takes.sql  # noqa: E402,F401

config = context.config
if config.config_file_name is not None:
    # Keep the app's loggers working when migrations run inside it (tests).
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# Tests pass the URL in config.attributes; otherwise it comes from DB_HOST etc.
url = config.attributes.get("url") or Settings.from_env().database_url
if url is None:
    raise SystemExit("No database configured: set DB_HOST, DB_USER, DB_PASSWORD and DB_NAME.")

engine = create_mysql_engine(url)
with engine.connect() as connection:
    context.configure(connection=connection, target_metadata=metadata)
    with context.begin_transaction():
        context.run_migrations()
engine.dispose()
