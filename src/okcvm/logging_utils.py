"""Centralised logging utilities for the OKCVM project.

This module provides a thin wrapper around the standard :mod:`logging`
package so that the web server, background tools and CLI all emit messages
using the same configuration.  The configuration is intentionally kept
simple – console output for development visibility and a rotating log file
for historical inspection – but can be customised through environment
variables when required.

Environment variables
---------------------
``OKCVM_LOG_LEVEL``
    Overrides the default log level (``INFO``).  Any value understood by the
    :mod:`logging` module is accepted (e.g. ``DEBUG``, ``WARNING``).

``OKCVM_LOG_FILE``
    Absolute or relative path to the log file.  Defaults to ``logs/okcvm.log``
    inside the project root.  The directory is created automatically.

The :func:`setup_logging` function is idempotent.  The first call sets up the
handlers; subsequent calls are ignored to avoid interfering with loggers that
may already be configured by Uvicorn or external libraries.
"""

from __future__ import annotations

from pathlib import Path
import logging
import logging.config
import os
from typing import Any, Dict

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LOG_DIR = PROJECT_ROOT / "logs"
DEFAULT_LOG_FILE = DEFAULT_LOG_DIR / "okcvm.log"

_LOGGING_INITIALISED = False


def _normalise_log_file(path: str | os.PathLike[str] | None) -> Path:
    """Return a validated path for the log file.

    Parameters
    ----------
    path:
        Optional path provided via configuration or environment variable.
        Relative paths are resolved against the project root.
    """

    if path is None:
        return DEFAULT_LOG_FILE

    candidate = Path(path)
    if not candidate.is_absolute():
        candidate = PROJECT_ROOT / candidate
    candidate.parent.mkdir(parents=True, exist_ok=True)
    return candidate


def _build_logging_config(log_level: str, log_file: Path) -> Dict[str, Any]:
    """Construct the ``dictConfig`` structure for logging."""

    fmt = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
    uvicorn_fmt = (
        "%(asctime)s | %(levelname)-8s | %(name)s | %(client_addr)s - "
        "\"%(request_line)s\" %(status_code)s"
    )

    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "standard": {"format": fmt},
            "uvicorn": {"format": uvicorn_fmt},
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "formatter": "standard",
                "level": log_level,
            },
            "file": {
                "class": "logging.handlers.RotatingFileHandler",
                "formatter": "standard",
                "filename": str(log_file),
                "maxBytes": 5 * 1024 * 1024,
                "backupCount": 5,
                "encoding": "utf-8",
                "level": log_level,
            },
            "uvicorn.access": {
                "class": "logging.handlers.RotatingFileHandler",
                "formatter": "uvicorn",
                "filename": str(log_file),
                "maxBytes": 5 * 1024 * 1024,
                "backupCount": 5,
                "encoding": "utf-8",
                "level": "INFO",
            },
        },
        "loggers": {
            "okcvm": {
                "handlers": ["console", "file"],
                "level": log_level,
                "propagate": False,
            },
            "uvicorn": {
                "handlers": ["console", "file"],
                "level": log_level,
            },
            "uvicorn.error": {
                "handlers": ["console", "file"],
                "level": log_level,
                "propagate": False,
            },
            "uvicorn.access": {
                "handlers": ["uvicorn.access"],
                "level": "INFO",
                "propagate": False,
            },
        },
        "root": {
            "handlers": ["console", "file"],
            "level": log_level,
        },
    }


def setup_logging(*, log_level: str | None = None, log_file: str | os.PathLike[str] | None = None) -> None:
    """Initialise logging for the process if it has not already been done."""

    global _LOGGING_INITIALISED
    if _LOGGING_INITIALISED:
        return

    level = (log_level or os.getenv("OKCVM_LOG_LEVEL") or "INFO").upper()
    file_path = _normalise_log_file(log_file or os.getenv("OKCVM_LOG_FILE"))
    file_path.parent.mkdir(parents=True, exist_ok=True)

    config = _build_logging_config(level, file_path)
    logging.config.dictConfig(config)
    _LOGGING_INITIALISED = True


def get_logger(name: str | None = None) -> logging.Logger:
    """Return a configured logger, initialising logging if necessary."""

    if not _LOGGING_INITIALISED:
        setup_logging()
    return logging.getLogger(name or "okcvm")


__all__ = ["get_logger", "setup_logging", "PROJECT_ROOT", "DEFAULT_LOG_DIR", "DEFAULT_LOG_FILE"]

