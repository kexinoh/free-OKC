from __future__ import annotations

import time
from pathlib import Path
from typing import Dict, Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from ..config import ModelEndpointConfig, configure, get_config
from ..logging_utils import get_logger, setup_logging
from ..session import SessionState
from .models import ChatRequest, ConfigUpdatePayload, build_media_config

# --- Frontend Setup ---
FRONTEND_DIR = Path(__file__).resolve().parents[3] / "frontend"


setup_logging()
logger = get_logger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Emit structured logs for each HTTP request handled by FastAPI."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = uuid4().hex[:8]
        start = time.perf_counter()
        logger.info(
            "HTTP %s %s started [%s]",
            request.method,
            request.url.path,
            request_id,
        )

        try:
            response = await call_next(request)
        except Exception:
            logger.exception(
                "HTTP %s %s failed [%s]",
                request.method,
                request.url.path,
                request_id,
            )
            raise

        elapsed_ms = (time.perf_counter() - start) * 1000
        logger.info(
            "HTTP %s %s completed [%s] %s in %.2fms",
            request.method,
            request.url.path,
            request_id,
            response.status_code,
            elapsed_ms,
        )
        return response


def _ensure_frontend() -> None:
    if not FRONTEND_DIR.exists():  # pragma: no cover - developer misconfiguration
        raise RuntimeError(
            "The frontend directory could not be located. Expected path: "
            f"{FRONTEND_DIR}"
        )

_ensure_frontend()

# --- Application State ---
# Single global session state for this demo application
state = SessionState()

# --- Helper Functions ---
def _describe_endpoint(config: ModelEndpointConfig | None) -> Optional[Dict[str, object]]:
    if config is None:
        return None
    description = config.describe()
    description["model"] = config.model
    description["base_url"] = config.base_url
    return description


# --- FastAPI App Creation ---
def create_app() -> FastAPI:
    """Creates and configures the FastAPI application."""
    app = FastAPI(title="OKCVM Orchestrator", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestLoggingMiddleware)

    # --- Static Files and Root Redirect ---
    app.mount("/ui", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="ui")

    @app.get("/")
    async def root() -> RedirectResponse:
        return RedirectResponse(url="/ui/")

    # --- API Routes ---
    @app.get("/api/config")
    async def read_config() -> Dict[str, object]:
        config = get_config()
        logger.debug("Read configuration (chat configured=%s)", bool(config.chat))
        return {
            "chat": _describe_endpoint(config.chat),
            "image": _describe_endpoint(config.media.image),
            "speech": _describe_endpoint(config.media.speech),
            "sound_effects": _describe_endpoint(config.media.sound_effects),
            "asr": _describe_endpoint(config.media.asr),
        }

    @app.post("/api/config")
    async def update_config(payload: ConfigUpdatePayload) -> Dict[str, object]:
        payload_dump = payload.model_dump(exclude_none=True)
        chat_payload = payload_dump.get("chat")
        if isinstance(chat_payload, dict) and chat_payload.get("api_key"):
            chat_payload = dict(chat_payload)
            chat_payload["api_key"] = "***redacted***"
            payload_dump["chat"] = chat_payload

        logger.info("Updating configuration sections=%s", list(payload_dump.keys()))
        logger.debug("Configuration payload details: %s", payload_dump)
        try:
            media_config = build_media_config(payload)
            chat_config = payload.chat.to_model() if payload.chat else None
            configure(media=media_config, chat=chat_config)
        except Exception as exc:
            logger.exception("Configuration update failed")
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return await read_config()

    @app.get("/api/session/info")
    async def session_info() -> Dict[str, object]:
        description = state.vm.describe()
        logger.debug("Session info requested (history=%s)", description.get("history_length"))
        return description

    @app.get("/api/session/history/{entry_id}")
    async def session_history_entry(entry_id: str) -> Dict[str, object]:
        logger.debug("History entry requested id=%s", entry_id)
        entry = state.vm.get_history_entry(entry_id)
        if entry is None:
            raise HTTPException(status_code=404, detail="History entry not found")
        return entry

    @app.get("/api/session/boot")
    async def session_boot() -> Dict[str, object]:
        logger.info("Session boot requested")
        return state.boot()

    @app.post("/api/chat")
    async def chat(request: ChatRequest) -> Dict[str, object]:
        logger.info("Chat request received: %s", request.message[:120])
        response = state.respond(request.message)
        logger.debug(
            "Chat response generated (preview=%s, history=%s, summary=%s)",
            bool(response.get("web_preview")),
            len(response.get("vm_history", [])),
            response.get("meta", {}).get("summary"),
        )
        return response

    @app.delete("/api/session/history")
    async def delete_session_history() -> Dict[str, object]:
        logger.info("Session history deletion endpoint called")
        result = state.delete_history()
        logger.debug(
            "Session history cleared (workspace_removed=%s)",
            result.get("workspace", {}).get("removed"),
        )
        return result

    return app


app = create_app()
