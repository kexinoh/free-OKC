from __future__ import annotations

from pathlib import Path
from typing import Dict, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles

from ..config import ModelEndpointConfig, configure, get_config
from ..session import SessionState
from .models import ChatRequest, ConfigUpdatePayload, build_media_config

# --- Frontend Setup ---
FRONTEND_DIR = Path(__file__).resolve().parents[3] / "frontend"


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

    # --- Static Files and Root Redirect ---
    app.mount("/ui", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="ui")

    @app.get("/")
    async def root() -> RedirectResponse:
        return RedirectResponse(url="/ui/")

    # --- API Routes ---
    @app.get("/api/config")
    async def read_config() -> Dict[str, object]:
        config = get_config()
        return {
            "chat": _describe_endpoint(config.chat),
            "image": _describe_endpoint(config.media.image),
            "speech": _describe_endpoint(config.media.speech),
            "sound_effects": _describe_endpoint(config.media.sound_effects),
            "asr": _describe_endpoint(config.media.asr),
        }

    @app.post("/api/config")
    async def update_config(payload: ConfigUpdatePayload) -> Dict[str, object]:
        try:
            media_config = build_media_config(payload)
            chat_config = payload.chat.to_model() if payload.chat else None
            configure(media=media_config, chat=chat_config)
        except Exception as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return await read_config()

    @app.get("/api/session/info")
    async def session_info() -> Dict[str, object]:
        return state.vm.describe()

    @app.get("/api/session/boot")
    async def session_boot() -> Dict[str, object]:
        return state.boot()

    @app.post("/api/chat")
    async def chat(request: ChatRequest) -> Dict[str, object]:
        return state.respond(request.message)

    return app


app = create_app()
