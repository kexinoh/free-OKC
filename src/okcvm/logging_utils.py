"""Centralised logging configuration for the OKCVM services.

This module installs a rich logging configuration that works both when the
FastAPI application is served through ``uvicorn`` and when the CLI utility
in :mod:`main` bootstraps the orchestrator.  The goal is to offer actionable
diagnostics without requiring every caller to hand-roll their own logger.

The configuration exposes two handlers:

``console``
    Pretty, colourised output powered by :class:`rich.logging.RichHandler`.
``file``
    A rotating file handler which stores verbose logs under ``logs/`` so that
    long running sessions can be inspected after the fact.

Call :func:`setup_logging` once during application start-up to ensure the
handlers are installed.  The function is idempotent – subsequent invocations
will be no-ops unless ``force=True`` is supplied.
"""

from __future__ import annotations

import logging
import logging.config
import os
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Optional

from rich.logging import RichHandler

# Maximum size for the rotating log files (5 MiB by default).
_DEFAULT_MAX_BYTES = 5 * 1024 * 1024

_CONFIGURED = False


def _determine_log_directory() -> Path:
    """Return the directory used to store persistent log files."""

    root = Path(__file__).resolve().parents[2]
    log_dir = Path(os.getenv("OKCVM_LOG_DIR", root / "logs"))
    log_dir.mkdir(parents=True, exist_ok=True)
    return log_dir


def _build_logging_config(level: str) -> dict:
    """Construct the dictionary passed to :func:`logging.config.dictConfig`."""

    log_dir = _determine_log_directory()
    common_handler_kwargs = {
        "maxBytes": int(os.getenv("OKCVM_LOG_MAX_BYTES", _DEFAULT_MAX_BYTES)),
        "backupCount": int(os.getenv("OKCVM_LOG_BACKUP_COUNT", 5)),
        "encoding": "utf-8",
    }

    return {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "rich": {"format": "%(message)s"},
            "standard": {
                "format": "%(asctime)s | %(levelname)-8s | %(name)s:%(lineno)d | %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
            },
            "access": {
                "format": "%(asctime)s | %(levelname)s | %(message)s",
                "datefmt": "%Y-%m-%d %H:%M:%S",
            },
        },
        "handlers": {
            "console": {
                "()": RichHandler,
                "level": level,
                "formatter": "rich",
                "rich_tracebacks": True,
                "tracebacks_show_locals": False,
            },
            "file": {
                "()": RotatingFileHandler,
                "level": "DEBUG",
                "formatter": "standard",
                "filename": str(log_dir / "okcvm.log"),
                **common_handler_kwargs,
            },
            "access_file": {
                "()": RotatingFileHandler,
                "level": "INFO",
                "formatter": "access",
                "filename": str(log_dir / "access.log"),
                **common_handler_kwargs,
            },
        },
        "loggers": {
            "": {  # Root logger
                "level": level,
                "handlers": ["console", "file"],
            },
            "uvicorn": {
                "level": level,
                "handlers": ["console", "file"],
                "propagate": False,
            },
            "uvicorn.error": {
                "level": level,
                "handlers": ["console", "file"],
                "propagate": False,
            },
            "uvicorn.access": {
                "level": "INFO",
                "handlers": ["console", "access_file"],
                "propagate": False,
            },
        },
    }


def setup_logging(level: Optional[str] = None, *, force: bool = False) -> None:
    """Initialise the logging system used by the project."""

    global _CONFIGURED
    if _CONFIGURED and not force:
        return

    requested_level = (level or os.getenv("OKCVM_LOG_LEVEL", "INFO")).upper()
    config = _build_logging_config(requested_level)
    logging.config.dictConfig(config)
    _CONFIGURED = True

    logging.getLogger(__name__).debug(
        "Logging configured (level=%s, log_dir=%s)",
        requested_level,
        _determine_log_directory(),
    )


def get_logger(name: Optional[str] = None) -> logging.Logger:
    """Return a module-level logger using the configured hierarchy."""

    return logging.getLogger(name or "okcvm")


__all__ = ["get_logger", "setup_logging"]

