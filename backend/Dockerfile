FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ app/
COPY alembic.ini .
COPY migrations/ migrations/

# Questions live in /app/data (a volume in deploy/docker-compose.yml).
RUN useradd --system --uid 10001 umless && mkdir -p data && chown umless data
USER umless

EXPOSE 8000
# With a database (DB_HOST), bring its schema up to date first; a failed migration stops the
# container instead of starting the app on an old schema.
# One process: the JSON question store and the MySQL store's write lock assume a single worker.
CMD ["sh", "-c", "if [ -n \"$DB_HOST\" ]; then alembic upgrade head || exit 1; fi; exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 1"]
