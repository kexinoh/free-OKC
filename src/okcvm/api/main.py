from __future__ import annotations

import asyncio
import time
from pathlib import Path
from threading import Lock
from typing import Dict, Iterable, List, Optional, Tuple, TYPE_CHECKING
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse, StreamingResponse, JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from ..config import MediaConfig, ModelEndpointConfig, configure, get_config
from ..logging_utils import get_logger, setup_logging
from ..session import SessionState
from ..streaming import EventStreamPublisher, LangChainStreamingHandler
from ..workspace import WorkspaceStateError
from ..storage import get_conversation_store

if TYPE_CHECKING:  # pragma: no cover - import used for type checking only
    from ..vm import VirtualMachine
from .models import (
    ChatRequest,
    ConfigUpdatePayload,
    ConversationPayload,
    SnapshotCreatePayload,
    SnapshotRestorePayload,
    WorkspaceBranchPayload,
)

# --- Frontend Setup ---
def _get_base_path() -> Path:
    """Get the base path for resources, supporting PyInstaller bundled mode."""
    import sys
    if getattr(sys, 'frozen', False) and hasattr(sys, '_MEIPASS'):
        # Running as PyInstaller bundle
        return Path(sys._MEIPASS)
    # Running as script - frontend is 3 levels up from this file
    return Path(__file__).resolve().parents[3]

FRONTEND_DIR = _get_base_path() / "frontend"


MAX_UPLOAD_FILES = 100
MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024
MAX_UPLOAD_SIZE_MB = MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)
UPLOAD_CHUNK_SIZE = 4 * 1024 * 1024


setup_logging()
logger = get_logger(__name__)


def _inject_upload_constraints(payload: Dict[str, object]) -> Dict[str, object]:
    payload["upload_limit"] = MAX_UPLOAD_FILES
    payload["max_upload_size_mb"] = MAX_UPLOAD_SIZE_MB
    payload["max_upload_size_bytes"] = MAX_UPLOAD_SIZE_BYTES
    return payload


def _sanitize_upload_filename(filename: str) -> str:
    candidate = Path(filename or "").name
    cleaned = candidate.strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="文件名不能为空")
    return cleaned


def _ensure_path_within_base(base: Path, candidate: Path) -> Path:
    """Ensure *candidate* resolves within *base* and return the resolved path."""

    base_resolved = base.resolve()
    candidate_resolved = candidate.resolve()
    try:
        candidate_resolved.relative_to(base_resolved)
    except ValueError:
        raise HTTPException(status_code=400, detail="非法的文件路径")
    return candidate_resolved


async def _persist_upload_file(upload: UploadFile, destination: Path) -> int:
    size = 0
    destination.parent.mkdir(parents=True, exist_ok=True)
    try:
        with destination.open("wb") as buffer:
            while True:
                chunk = await upload.read(UPLOAD_CHUNK_SIZE)
                if not chunk:
                    break
                size += len(chunk)
                if size > MAX_UPLOAD_SIZE_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"单个文件大小不能超过 {MAX_UPLOAD_SIZE_MB} MB",
                    )
                buffer.write(chunk)
    except HTTPException:
        if destination.exists():
            destination.unlink(missing_ok=True)
        raise
    except Exception as exc:  # pragma: no cover - defensive guard
        if destination.exists():
            destination.unlink(missing_ok=True)
        logger.exception("Failed to store uploaded file %s", destination.name)
        raise HTTPException(status_code=500, detail=f"保存文件 {destination.name} 失败：{exc}") from exc
    finally:
        await upload.close()
    return size


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
    # Log the frontend directory for debugging
    logger.info(f"Frontend directory: {FRONTEND_DIR}")
    logger.info(f"Frontend directory exists: {FRONTEND_DIR.exists()}")
    if FRONTEND_DIR.exists():
        logger.info(f"Frontend directory contents: {list(FRONTEND_DIR.iterdir())[:10]}")

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

    def __init__(self) -> None:
        self._lock = Lock()
        self._cached_session: Optional[SessionState] = None

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

    def set(self, session: SessionState) -> None:
        """Cache the provided session for subsequent helper access."""

        with self._lock:
            self._cached_session = session

    def clear(self) -> None:
        """Forget any cached session reference."""

        with self._lock:
            self._cached_session = None

    @property
    def session(self) -> SessionState:
        """Return the most relevant session, creating the default if needed."""

        with self._lock:
            cached = self._cached_session
        if cached is not None:
            return cached

        session = self._resolve_session()
        with self._lock:
            self._cached_session = session
        return session

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
    # 自定义静态文件路由，确保 HTML 文件正确返回
    @app.get("/ui/{file_path:path}")
    async def serve_frontend(file_path: str) -> Response:
        """服务前端静态文件，确保 HTML 文件的 Content-Type 正确"""
        # 默认返回 index.html
        if not file_path or file_path == "" or file_path.endswith("/"):
            file_path = file_path.rstrip("/") + "/index.html" if file_path else "index.html"

        # 构建完整路径
        full_path = FRONTEND_DIR / file_path

        # 安全检查：确保路径在 FRONTEND_DIR 内
        try:
            full_path = full_path.resolve()
            full_path.relative_to(FRONTEND_DIR.resolve())
        except (ValueError, RuntimeError):
            raise HTTPException(status_code=404, detail="File not found")

        # 检查文件是否存在
        if not full_path.is_file():
            # 如果是目录，尝试返回 index.html
            if full_path.is_dir():
                index_path = full_path / "index.html"
                if index_path.is_file():
                    full_path = index_path
                else:
                    raise HTTPException(status_code=404, detail="File not found")
            else:
                raise HTTPException(status_code=404, detail="File not found")

        # 确定 MIME 类型
        media_type = None
        suffix = full_path.suffix.lower()
        if suffix in {".html", ".htm"}:
            media_type = "text/html; charset=utf-8"
        elif suffix == ".css":
            media_type = "text/css; charset=utf-8"
        elif suffix == ".js":
            media_type = "application/javascript; charset=utf-8"
        elif suffix == ".json":
            media_type = "application/json; charset=utf-8"
        elif suffix in {".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico"}:
            media_type = f"image/{suffix[1:]}"
        elif suffix == ".woff":
            media_type = "font/woff"
        elif suffix == ".woff2":
            media_type = "font/woff2"
        elif suffix == ".ttf":
            media_type = "font/ttf"

        logger.debug(f"Serving frontend file: {file_path} (media_type={media_type})")
        # 禁用缓存，特别是对于 JavaScript 文件
        headers = {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        }
        return FileResponse(full_path, media_type=media_type, headers=headers)

    # 备用方案：使用 StaticFiles（但优先级较低，只在上面的路由不匹配时使用）
    # app.mount("/ui", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="ui")

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
        raw_payload = payload.model_dump(mode="json")
        chat_payload = raw_payload.get("chat")
        if isinstance(chat_payload, dict) and chat_payload.get("api_key"):
            chat_payload = dict(chat_payload)
            chat_payload["api_key"] = "***redacted***"
            raw_payload["chat"] = chat_payload

        logger.debug("Configuration payload received: %s", raw_payload)

        config = get_config()
        configure_kwargs: Dict[str, object] = {}
        updated_sections: list[str] = []

        if "chat" in payload.model_fields_set:
            updated_sections.append("chat")
            if payload.chat is None:
                configure_kwargs["chat"] = None
            else:
                chat_config = payload.chat.to_model()
                if chat_config is None:
                    configure_kwargs["chat"] = None
                else:
                    if (
                        "api_key" not in payload.chat.model_fields_set
                        and config.chat is not None
                    ):
                        chat_config.api_key = config.chat.api_key
                    if (
                        "supports_streaming" not in payload.chat.model_fields_set
                        and config.chat is not None
                        and config.chat.supports_streaming is not None
                    ):
                        chat_config.supports_streaming = config.chat.supports_streaming
                    configure_kwargs["chat"] = chat_config

        media_fields = ("image", "speech", "sound_effects", "asr")
        media_updates = {
            field
            for field in media_fields
            if field in payload.model_fields_set
        }

        if media_updates:
            updated_sections.extend(sorted(media_updates))
            current_media = config.media

            def resolve_media(field: str) -> ModelEndpointConfig | None:
                if field not in media_updates:
                    return getattr(current_media, field)
                endpoint_payload = getattr(payload, field)
                if endpoint_payload is None:
                    return None
                endpoint_config = endpoint_payload.to_model()
                if endpoint_config is None:
                    return None
                current_value = getattr(current_media, field)
                if (
                    "api_key" not in endpoint_payload.model_fields_set
                    and current_value is not None
                ):
                    endpoint_config.api_key = current_value.api_key
                if (
                    "supports_streaming" not in endpoint_payload.model_fields_set
                    and current_value is not None
                ):
                    endpoint_config.supports_streaming = current_value.supports_streaming
                return endpoint_config

            media_config = MediaConfig(
                image=resolve_media("image"),
                speech=resolve_media("speech"),
                sound_effects=resolve_media("sound_effects"),
                asr=resolve_media("asr"),
            )
            configure_kwargs["media"] = media_config

        if not configure_kwargs:
            logger.info("Configuration update requested with no effective changes")
            return await read_config()

        logger.info("Updating configuration sections=%s", updated_sections)
        try:
            configure(**configure_kwargs)
        except Exception as exc:
            logger.exception("Configuration update failed")
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return await read_config()

    @app.get("/api/conversations")
    async def list_conversations(
        request: Request,
        client_id: Optional[str] = Query(default=None),
    ) -> Dict[str, object]:
        resolved = _resolve_client_id(request, client_id)
        logger.debug("Listing conversations for client=%s", resolved)
        store = get_conversation_store()
        conversations = await asyncio.to_thread(store.list_conversations, resolved)
        return {"conversations": conversations}

    @app.post("/api/conversations")
    async def create_conversation_entry(
        request: Request,
        payload: ConversationPayload,
        client_id: Optional[str] = Query(default=None),
    ) -> Dict[str, object]:
        resolved = _resolve_client_id(request, client_id)
        data = payload.model_dump(mode="json")
        store = get_conversation_store()
        logger.info("Creating conversation entry client=%s id=%s", resolved, data.get("id"))
        conversation = await asyncio.to_thread(store.save_conversation, resolved, data)
        return {"conversation": conversation}

    @app.put("/api/conversations/{conversation_id}")
    async def upsert_conversation_entry(
        request: Request,
        conversation_id: str,
        payload: ConversationPayload,
        client_id: Optional[str] = Query(default=None),
    ) -> Dict[str, object]:
        resolved = _resolve_client_id(request, client_id)
        data = payload.model_dump(mode="json")
        data["id"] = conversation_id
        store = get_conversation_store()
        logger.debug("Persisting conversation client=%s id=%s", resolved, conversation_id)
        conversation = await asyncio.to_thread(store.save_conversation, resolved, data)
        return {"conversation": conversation}

    @app.delete("/api/conversations/{conversation_id}")
    async def delete_conversation_entry(
        request: Request,
        conversation_id: str,
        client_id: Optional[str] = Query(default=None),
    ) -> Dict[str, object]:
        resolved = _resolve_client_id(request, client_id)
        store = get_conversation_store()
        logger.info("Deleting conversation client=%s id=%s", resolved, conversation_id)
        success, summary = await asyncio.to_thread(
            store.delete_conversation,
            resolved,
            conversation_id,
        )
        if not success:
            raise HTTPException(status_code=404, detail="Conversation not found")
        return {"deleted": True, "workspace": summary}

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
        return _inject_upload_constraints(session.boot())

    @app.get("/api/session/files")
    async def list_session_files(
        request: Request, client_id: Optional[str] = Query(default=None)
    ) -> Dict[str, object]:
        session = _get_session(request, client_id)
        files = session.list_uploaded_files()
        logger.debug(
            "Listing uploaded files client=%s count=%s",
            session.client_id,
            len(files),
        )
        return {
            "files": files,
            "limit": MAX_UPLOAD_FILES,
            "max_file_size_mb": MAX_UPLOAD_SIZE_MB,
            "max_file_size_bytes": MAX_UPLOAD_SIZE_BYTES,
        }

    @app.post("/api/session/files")
    async def upload_session_files(
        request: Request,
        files: List[UploadFile] = File(..., description="要上传的文件列表"),
        client_id: Optional[str] = Query(default=None),
    ) -> Dict[str, object]:
        session = _get_session(request, client_id)
        if not files:
            raise HTTPException(status_code=400, detail="请选择要上传的文件")

        sanitized: List[Tuple[UploadFile, str]] = []
        seen_names: set[str] = set()
        for upload in files:
            filename = _sanitize_upload_filename(getattr(upload, "filename", ""))
            if filename in seen_names:
                raise HTTPException(status_code=400, detail=f"同一批次中存在重复文件名：{filename}")
            seen_names.add(filename)
            sanitized.append((upload, filename))

        existing_files = session.list_uploaded_files()
        existing_names = {
            entry.get("name")
            for entry in existing_files
            if isinstance(entry, dict) and isinstance(entry.get("name"), str)
        }
        projected_count = len(existing_names)
        for _, name in sanitized:
            if name not in existing_names:
                projected_count += 1
        if projected_count > MAX_UPLOAD_FILES:
            raise HTTPException(
                status_code=400,
                detail=f"上传后文件总数将超过 {MAX_UPLOAD_FILES} 个上限",
            )

        internal_mount = session.workspace.paths.internal_mount
        internal_mount_resolved = internal_mount.resolve()
        saved_payloads: List[Dict[str, object]] = []
        saved_paths: List[Path] = []
        try:
            for upload, name in sanitized:
                destination = _ensure_path_within_base(internal_mount_resolved, internal_mount / name)
                size = await _persist_upload_file(upload, destination)
                saved_paths.append(destination)
                saved_payloads.append(
                    {"name": name, "relative_path": name, "size_bytes": size}
                )
        except HTTPException:
            for path in saved_paths:
                try:
                    path.unlink(missing_ok=True)
                except OSError:
                    logger.debug("Failed to remove partial upload %s", path)
            raise

        manifest = session.register_uploaded_files(saved_payloads)
        logger.info(
            "Uploaded files client=%s names=%s",
            session.client_id,
            [payload["name"] for payload in saved_payloads],
        )

        return {
            "files": manifest["files"],
            "summaries": manifest["summaries"],
            "system_prompt": manifest["system_prompt"],
            "limit": MAX_UPLOAD_FILES,
            "max_file_size_mb": MAX_UPLOAD_SIZE_MB,
            "max_file_size_bytes": MAX_UPLOAD_SIZE_BYTES,
        }

    @app.post("/api/chat")
    async def chat(
        request: Request,
        payload: ChatRequest,
        client_id: Optional[str] = Query(default=None),
    ) -> Response:
        session = _get_session(request, client_id)
        logger.info(
            "Chat request received client=%s replace_last=%s: %s",
            session.client_id,
            payload.replace_last,
            payload.message[:120],
        )
        streaming_requested = payload.stream
        accept_header = request.headers.get("accept", "")
        accepts_event_stream = "text/event-stream" in accept_header.lower()
        if streaming_requested and not accepts_event_stream:
            logger.debug(
                "Streaming requested but client does not accept event streams",
            )
            streaming_requested = False
        if streaming_requested:
            chat_config = get_config().chat
            if chat_config is None or not chat_config.supports_streaming:
                logger.warning(
                    "Streaming requested but disabled (configured=%s)",
                    chat_config is not None,
                )
                streaming_requested = False

        if streaming_requested:
            loop = asyncio.get_running_loop()
            publisher = EventStreamPublisher(loop)

            async def _run_stream() -> None:
                handler = LangChainStreamingHandler(publisher.publish)
                try:
                    result = await asyncio.to_thread(
                        session.respond,
                        payload.message,
                        replace_last=payload.replace_last,
                        stream_handler=handler,
                    )
                    publisher.publish(
                        {
                            "type": "final",
                            "payload": _inject_upload_constraints(result),
                        }
                    )
                except Exception as exc:  # pragma: no cover - defensive guard
                    logger.exception("Streaming chat failed for client=%s", session.client_id)
                    publisher.publish({"type": "error", "message": str(exc)})
                finally:
                    publisher.publish({"type": "stop"})
                    publisher.close()

            asyncio.create_task(_run_stream())
            headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
            return StreamingResponse(
                publisher.iter_sse(),
                media_type="text/event-stream",
                headers=headers,
            )

        response = await asyncio.to_thread(
            session.respond,
            payload.message,
            replace_last=payload.replace_last,
        )
        _inject_upload_constraints(response)
        logger.debug(
            "Chat response generated (preview=%s, history=%s, summary=%s)",
            bool(response.get("web_preview")),
            len(response.get("vm_history", [])),
            response.get("meta", {}).get("summary"),
        )
        return JSONResponse(response)

    @app.delete("/api/session/history")
    async def delete_session_history(
        request: Request, client_id: Optional[str] = Query(default=None)
    ) -> Dict[str, object]:
        session = _get_session(request, client_id)
        logger.info("Session history deletion endpoint called client=%s", session.client_id)
        result = session.delete_history()
        _inject_upload_constraints(result)
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
            "Workspace restore requested branch=%s snapshot=%s checkout=%s limit=%s",
            payload.branch,
            payload.snapshot_id,
            payload.checkout,
            limit,
        )
        try:
            summary = session.restore_workspace(
                payload.snapshot_id,
                branch=payload.branch,
                checkout=payload.checkout,
                limit=limit,
            )
        except WorkspaceStateError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"workspace_state": summary}

    @app.post("/api/session/workspace/branch")
    async def assign_workspace_branch(
        request: Request,
        payload: WorkspaceBranchPayload,
        limit: int = 20,
        client_id: Optional[str] = Query(default=None),
    ) -> Dict[str, object]:
        session = _get_session(request, client_id)
        logger.info(
            "Workspace branch assignment requested branch=%s snapshot=%s checkout=%s limit=%s",
            payload.branch,
            payload.snapshot_id,
            payload.checkout,
            limit,
        )
        try:
            summary = session.assign_workspace_branch(
                payload.branch,
                payload.snapshot_id,
                checkout=payload.checkout,
                limit=limit,
            )
        except WorkspaceStateError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {"workspace_state": summary}

    return app


app = create_app()
