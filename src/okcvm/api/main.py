from __future__ import annotations

import time
from pathlib import Path
from threading import Lock
from typing import Dict, Iterable, Optional, Tuple, TYPE_CHECKING
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from ..config import ModelEndpointConfig, configure, get_config
from ..logging_utils import get_logger, setup_logging
from ..session import SessionState
from ..workspace import WorkspaceStateError

if TYPE_CHECKING:  # pragma: no cover - import used for type checking only
    from ..vm import VirtualMachine
from .models import (
    ChatRequest,
    ConfigUpdatePayload,
    SnapshotCreatePayload,
    SnapshotRestorePayload,
    build_media_config,
)

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


class SessionStore:
    """Thread-safe registry mapping client identifiers to session states."""

    def __init__(self) -> None:
        self._sessions: Dict[str, SessionState] = {}
        self._lock = Lock()

    @staticmethod
    def _normalise(client_id: Optional[str]) -> str:
        cleaned = (client_id or "").strip()
        return cleaned or "default"

    def get(self, client_id: Optional[str], *, create: bool = True) -> Optional[SessionState]:
        key = self._normalise(client_id)
        with self._lock:
            session = self._sessions.get(key)
            if session is None and create:
                session = SessionState()
                session.attach_client(key)
                self._sessions[key] = session
            elif session is not None:
                session.attach_client(key)
            return session

    def iter_sessions(self, preferred: Optional[str] = None) -> Iterable[Tuple[str, SessionState]]:
        preferred_key = self._normalise(preferred) if preferred else None
        with self._lock:
            items = list(self._sessions.items())
        if preferred_key:
            items.sort(key=lambda item: (0 if item[0] == preferred_key else 1, item[0]))
        return items

    def reset(self) -> None:
        with self._lock:
            self._sessions.clear()
        state.clear()


session_store = SessionStore()


class AppState:
    """Convenience wrapper exposing commonly accessed session resources.

    The web application primarily interacts with ``SessionState`` instances
    obtained from :data:`session_store`.  Some tests – and occasionally
    debugging sessions – need quick access to the active virtual machine
    without knowing the client identifier.  Historically this was exposed as a
    module-level ``state`` object.  During recent refactors that attribute was
    removed which regressed the behaviour relied upon by the test-suite.

    To restore the ergonomics while keeping the ``SessionStore`` implementation
    encapsulated, this lightweight wrapper lazily resolves the most relevant
    session and exposes its virtual machine.  The helper is intentionally
    conservative: if no sessions exist it initialises the default one via the
    store, matching the behaviour of the HTTP handlers.
    """

    @staticmethod
    def _store() -> SessionStore:
        return session_store

    def _resolve_session(self, client_id: Optional[str] = None) -> SessionState:
        store = self._store()
        if client_id:
            session = store.get(client_id, create=True)
        else:
            session = next(
                (candidate for _, candidate in store.iter_sessions(preferred=None)),
                None,
            )
            if session is None:
                session = store.get(None, create=True)
        if session is None:  # pragma: no cover - defensive safety net
            raise RuntimeError("Unable to resolve session state")
        return session

    @property
    def session(self) -> SessionState:
        """Return the most relevant session, creating the default if needed."""

        return self._resolve_session()

    @property
    def vm(self) -> "VirtualMachine":
        """Expose the active virtual machine for convenience."""

        return self.session.vm

    def reset(self) -> None:
        """Clear all known sessions, mirroring :meth:`SessionStore.reset`."""

        self._store().reset()


state = AppState()

# --- Helper Functions ---
def _resolve_client_id(request: Request, explicit: Optional[str] = None) -> str:
    if explicit and explicit.strip():
        return explicit.strip()

    header = request.headers.get("x-okc-client-id")
    if header and header.strip():
        return header.strip()

    cookie = request.cookies.get("okc_client_id")
    if cookie and cookie.strip():
        return cookie.strip()

    query_value = request.query_params.get("client_id")
    if query_value and query_value.strip():
        return query_value.strip()

    return "default"


def _get_session(request: Request, client_id: Optional[str] = None) -> SessionState:
    resolved = _resolve_client_id(request, client_id)
    session = session_store.get(resolved, create=True)
    if session is None:  # pragma: no cover - defensive
        raise HTTPException(status_code=500, detail="Failed to initialise session")
    state.set(session)
    return session


def _normalise_asset_path(relative_path: str | None) -> Path:
    path_hint = (relative_path or "index.html").strip()
    if not path_hint or path_hint.endswith("/"):
        path_hint = f"{path_hint}index.html" if path_hint else "index.html"

    candidate = Path(path_hint)
    if candidate.is_absolute() or ".." in candidate.parts:
        raise HTTPException(status_code=400, detail="Invalid path")
    return candidate


def _resolve_deployment_asset(
    deployment_id: str, relative_path: str | None, client_id: Optional[str]
) -> Path:
    candidate_path = _normalise_asset_path(relative_path)
    for key, session in session_store.iter_sessions(preferred=client_id):
        workspace = getattr(session, "workspace", None)
        if workspace is None:
            continue
        target_dir = workspace.deployments_root / deployment_id
        if not target_dir.exists() or not target_dir.is_dir():
            continue

        resolved = (target_dir / candidate_path).resolve()
        try:
            resolved.relative_to(target_dir.resolve())
        except ValueError:
            continue

        if resolved.exists() and resolved.is_file():
            logger.debug(
                "Resolved deployment asset deployment=%s client=%s path=%s",
                deployment_id,
                key,
                resolved,
            )
            return resolved

    raise HTTPException(status_code=404, detail="File not found")


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
    async def root(
        request: Request,
        s: Optional[str] = Query(default=None, description="Deployment identifier"),
        path: Optional[str] = Query(default=None, description="Relative asset path"),
        client_id: Optional[str] = Query(default=None, description="Client identifier"),
    ) -> Response:
        if s:
            hint = _resolve_client_id(request, client_id)
            asset = _resolve_deployment_asset(s, path, hint)
            return FileResponse(asset)
        return RedirectResponse(url="/ui/")

    def _deployment_file_response(
        deployment_id: str,
        relative_path: str | None,
        request: Request,
        client_id: Optional[str],
    ) -> FileResponse:
        hint = _resolve_client_id(request, client_id)
        asset = _resolve_deployment_asset(deployment_id, relative_path, hint)
        media_type = None
        if asset.suffix.lower() in {".html", ".htm"}:
            media_type = "text/html"
        return FileResponse(asset, media_type=media_type)

    @app.get("/{deployment_id:int}", include_in_schema=False)
    async def deployment_index(
        request: Request,
        deployment_id: int,
        client_id: Optional[str] = Query(default=None),
    ) -> Response:
        return _deployment_file_response(str(deployment_id), None, request, client_id)

    @app.get("/{deployment_id:int}/", include_in_schema=False)
    async def deployment_index_trailing_slash(
        request: Request,
        deployment_id: int,
        client_id: Optional[str] = Query(default=None),
    ) -> Response:
        return _deployment_file_response(str(deployment_id), None, request, client_id)

    @app.get("/{deployment_id:int}/{asset_path:path}", include_in_schema=False)
    async def deployment_asset(
        request: Request,
        deployment_id: int,
        asset_path: str,
        client_id: Optional[str] = Query(default=None),
    ) -> Response:
        normalised = asset_path.lstrip("/") or None
        return _deployment_file_response(str(deployment_id), normalised, request, client_id)

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
    async def session_info(
        request: Request, client_id: Optional[str] = Query(default=None)
    ) -> Dict[str, object]:
        session = _get_session(request, client_id)
        description = session.vm.describe()
        logger.debug(
            "Session info requested (history=%s client=%s)",
            description.get("history_length"),
            session.client_id,
        )
        return description

    @app.get("/api/session/history/{entry_id}")
    async def session_history_entry(
        request: Request,
        entry_id: str,
        client_id: Optional[str] = Query(default=None),
    ) -> Dict[str, object]:
        session = _get_session(request, client_id)
        logger.debug("History entry requested id=%s client=%s", entry_id, session.client_id)
        entry = session.vm.get_history_entry(entry_id)
        if entry is None:
            raise HTTPException(status_code=404, detail="History entry not found")
        return entry

    @app.get("/api/session/boot")
    async def session_boot(
        request: Request, client_id: Optional[str] = Query(default=None)
    ) -> Dict[str, object]:
        session = _get_session(request, client_id)
        logger.info("Session boot requested client=%s", session.client_id)
        return session.boot()

    @app.post("/api/chat")
    async def chat(
        request: Request,
        payload: ChatRequest,
        client_id: Optional[str] = Query(default=None),
    ) -> Dict[str, object]:
        session = _get_session(request, client_id)
        logger.info(
            "Chat request received client=%s replace_last=%s: %s",
            session.client_id,
            payload.replace_last,
            payload.message[:120],
        )
        response = session.respond(payload.message, replace_last=payload.replace_last)
        logger.debug(
            "Chat response generated (preview=%s, history=%s, summary=%s)",
            bool(response.get("web_preview")),
            len(response.get("vm_history", [])),
            response.get("meta", {}).get("summary"),
        )
        return response

    @app.delete("/api/session/history")
    async def delete_session_history(
        request: Request, client_id: Optional[str] = Query(default=None)
    ) -> Dict[str, object]:
        session = _get_session(request, client_id)
        logger.info("Session history deletion endpoint called client=%s", session.client_id)
        result = session.delete_history()
        logger.debug(
            "Session history cleared (workspace_removed=%s)",
            result.get("workspace", {}).get("removed"),
        )
        return result

    @app.get("/api/session/workspace/snapshots")
    async def list_workspace_snapshots(
        request: Request,
        limit: int = 20,
        client_id: Optional[str] = Query(default=None),
    ) -> Dict[str, object]:
        session = _get_session(request, client_id)
        logger.debug(
            "Workspace snapshot list requested limit=%s client=%s",
            limit,
            session.client_id,
        )
        return session.list_workspace_snapshots(limit=limit)

    @app.post("/api/session/workspace/snapshots")
    async def create_workspace_snapshot(
        request: Request,
        payload: SnapshotCreatePayload,
        limit: int = 20,
        client_id: Optional[str] = Query(default=None),
    ) -> Dict[str, object]:
        session = _get_session(request, client_id)
        logger.info(
            "Workspace snapshot creation requested label=%s, limit=%s",
            payload.label,
            limit,
        )
        try:
            return session.snapshot_workspace(payload.label, limit=limit)
        except WorkspaceStateError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    @app.post("/api/session/workspace/restore")
    async def restore_workspace_snapshot(
        request: Request,
        payload: SnapshotRestorePayload,
        limit: int = 20,
        client_id: Optional[str] = Query(default=None),
    ) -> Dict[str, object]:
        session = _get_session(request, client_id)
        logger.info(
            "Workspace restore requested snapshot=%s, limit=%s",
            payload.snapshot_id,
            limit,
        )
        try:
            return session.restore_workspace(payload.snapshot_id, limit=limit)
        except WorkspaceStateError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    return app


app = create_app()
