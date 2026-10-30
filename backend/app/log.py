"""Non-blocking logging: every record goes on a queue and one listener thread writes it out,
so a request never waits on stdout. Started and stopped by the app's lifespan.

Never log transcript text or keys (docs/prd.md).
"""

import logging
import logging.handlers
import queue
import sys
import time
from typing import Callable, TextIO

LOG_LEVELS = ("DEBUG", "INFO", "WARNING", "ERROR")
LOG_FORMAT = "%(asctime)s %(levelname)s %(name)s %(message)s"
# Uvicorn sets its own handlers before the app loads; these are moved onto the queue too.
UVICORN_LOGGERS = ("uvicorn", "uvicorn.access")


def start_logging(level: str, stream: TextIO | None = None) -> Callable[[], None]:
    """Route all logging through a queue to `stream` (stdout); returns a stop function that
    flushes what's queued and puts the previous handlers back."""
    output = logging.StreamHandler(stream or sys.stdout)
    formatter = logging.Formatter(LOG_FORMAT, datefmt="%Y-%m-%dT%H:%M:%SZ")
    formatter.converter = time.gmtime
    output.setFormatter(formatter)

    records: queue.SimpleQueue = queue.SimpleQueue()
    listener = logging.handlers.QueueListener(records, output, respect_handler_level=True)

    root = logging.getLogger()
    saved = [(root, root.handlers[:], root.level, root.propagate)]
    for name in UVICORN_LOGGERS:
        logger = logging.getLogger(name)
        saved.append((logger, logger.handlers[:], logger.level, logger.propagate))
        logger.handlers.clear()
        logger.propagate = True
    root.handlers = [logging.handlers.QueueHandler(records)]
    root.setLevel(level)
    listener.start()

    def stop() -> None:
        listener.stop()
        for logger, handlers, old_level, propagate in saved:
            logger.handlers = handlers
            logger.setLevel(old_level)
            logger.propagate = propagate

    return stop
