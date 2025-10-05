from __future__ import annotations

import json
import shutil
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import Column, DateTime, String, Text, create_engine, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from ..config import ConversationStoreConfig, get_config
from ..logging_utils import get_logger

logger = get_logger(__name__)
Base = declarative_base()


class ConversationRecord(Base):
    """SQLAlchemy model storing conversation payloads per client."""

    __tablename__ = "okc_conversations"

    id = Column(String(64), primary_key=True)
    client_id = Column(String(128), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), nullable=False, index=True)
    payload = Column(Text, nullable=False)
    workspace_root = Column(Text, nullable=True)
    workspace_mount = Column(Text, nullable=True)
    workspace_session = Column(String(128), nullable=True)
    git_commit = Column(String(128), nullable=True)
    git_dirty = Column(String(8), nullable=True)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _normalise_timestamp(value: Any, *, fallback: datetime) -> datetime:
    if isinstance(value, str):
        candidate = value.strip()
        if candidate:
            if candidate.endswith("Z"):
                candidate = f"{candidate[:-1]}+00:00"
            try:
                parsed = datetime.fromisoformat(candidate)
            except ValueError:
                parsed = None
            if parsed is not None:
                if parsed.tzinfo is None:
                    parsed = parsed.replace(tzinfo=timezone.utc)
                return parsed.astimezone(timezone.utc)
    return fallback


def _normalise_string(value: Any) -> Optional[str]:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return None


def _normalise_bool(value: Any) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"1", "true", "yes", "on"}:
            return True
        if lowered in {"0", "false", "no", "off"}:
            return False
    return None


class ConversationStore:
    """Persist conversation graphs in a SQL database."""

    def __init__(self, config: ConversationStoreConfig) -> None:
        self._config = config.copy()
        self._engine = self._create_engine(self._config)
        Base.metadata.create_all(self._engine)
        self._session_factory = sessionmaker(
            bind=self._engine,
            expire_on_commit=False,
            future=True,
        )

    @staticmethod
    def _create_engine(config: ConversationStoreConfig) -> Engine:
        url = config.effective_url()
        kwargs: Dict[str, Any] = {
            "future": True,
            "echo": config.echo,
            "pool_pre_ping": True,
        }
        connect_args: Dict[str, Any] = {}
        if url.startswith("sqlite"):
            connect_args["check_same_thread"] = False
        if connect_args:
            kwargs["connect_args"] = connect_args
        if config.pool_size and not url.startswith("sqlite"):
            kwargs["pool_size"] = config.pool_size
        engine = create_engine(url, **kwargs)
        logger.info("Conversation store engine initialised (url=%s)", url)
        return engine

    def _session(self) -> Session:
        return self._session_factory()

    # --- public API -----------------------------------------------------
    def list_conversations(self, client_id: str) -> List[Dict[str, Any]]:
        with self._session() as session:
            rows = (
                session.execute(
                    select(ConversationRecord)
                    .where(ConversationRecord.client_id == client_id)
                    .order_by(ConversationRecord.updated_at.desc())
                )
                .scalars()
                .all()
            )
        return [self._record_to_payload(row) for row in rows]

    def get_conversation(self, client_id: str, conversation_id: str) -> Optional[Dict[str, Any]]:
        with self._session() as session:
            record = session.get(ConversationRecord, conversation_id)
            if record is None or record.client_id != client_id:
                return None
            return self._record_to_payload(record)

    def save_conversation(self, client_id: str, conversation: Dict[str, Any]) -> Dict[str, Any]:
        conversation_id = _normalise_string(conversation.get("id"))
        if not conversation_id:
            raise ValueError("Conversation payload must include an 'id'")

        created_at = _normalise_timestamp(
            conversation.get("createdAt"),
            fallback=_now(),
        )
        updated_at = _normalise_timestamp(
            conversation.get("updatedAt"),
            fallback=created_at,
        )
        title = _normalise_string(conversation.get("title")) or "新的会话"

        workspace = conversation.get("workspace")
        workspace_paths: Dict[str, Any] = {}
        workspace_git: Dict[str, Any] = {}
        if isinstance(workspace, dict):
            raw_paths = workspace.get("paths")
            if isinstance(raw_paths, dict):
                workspace_paths = raw_paths
            raw_git = workspace.get("git")
            if isinstance(raw_git, dict):
                workspace_git = raw_git

        workspace_root = _normalise_string(
            workspace_paths.get("internal_root") or workspace_paths.get("internalRoot")
        )
        workspace_mount = _normalise_string(workspace_paths.get("mount"))
        workspace_session = _normalise_string(
            workspace_paths.get("session_id") or workspace_paths.get("sessionId")
        )
        git_commit = _normalise_string(
            workspace_git.get("commit") or workspace_git.get("head")
        )
        git_dirty_bool = _normalise_bool(workspace_git.get("is_dirty"))
        git_dirty = None
        if git_dirty_bool is True:
            git_dirty = "1"
        elif git_dirty_bool is False:
            git_dirty = "0"

        payload_json = json.dumps(conversation, ensure_ascii=False)

        with self._session() as session:
            record = session.get(ConversationRecord, conversation_id)
            if record is None:
                record = ConversationRecord(
                    id=conversation_id,
                    client_id=client_id,
                    title=title,
                    created_at=created_at,
                    updated_at=updated_at,
                    payload=payload_json,
                    workspace_root=workspace_root,
                    workspace_mount=workspace_mount,
                    workspace_session=workspace_session,
                    git_commit=git_commit,
                    git_dirty=git_dirty,
                )
                session.add(record)
            else:
                if record.client_id != client_id:
                    raise ValueError("Conversation token mismatch")
                record.title = title
                record.updated_at = updated_at
                record.payload = payload_json
                record.workspace_root = workspace_root
                record.workspace_mount = workspace_mount
                record.workspace_session = workspace_session
                record.git_commit = git_commit
                record.git_dirty = git_dirty
                if record.created_at is None:
                    record.created_at = created_at
            session.commit()

        return conversation

    def delete_conversation(
        self, client_id: str, conversation_id: str
    ) -> Tuple[bool, Dict[str, Any]]:
        with self._session() as session:
            record = session.get(ConversationRecord, conversation_id)
            if record is None or record.client_id != client_id:
                return False, {"removed": False}
            payload = self._record_to_payload(record)
            session.delete(record)
            session.commit()
        cleanup_summary = self._cleanup_workspace(payload)
        return True, cleanup_summary

    # --- helpers --------------------------------------------------------
    def _record_to_payload(self, record: ConversationRecord) -> Dict[str, Any]:
        try:
            data = json.loads(record.payload)
            if not isinstance(data, dict):
                data = {}
        except json.JSONDecodeError:
            data = {}

        data.setdefault("id", record.id)
        data.setdefault("title", record.title)
        data.setdefault("createdAt", record.created_at.isoformat())
        data.setdefault("updatedAt", record.updated_at.isoformat())

        workspace_info = data.get("workspace")
        if not isinstance(workspace_info, dict):
            workspace_info = {}
        paths = workspace_info.get("paths")
        if not isinstance(paths, dict):
            paths = {}
        mutated = False
        if record.workspace_root and "internal_root" not in paths:
            paths["internal_root"] = record.workspace_root
            mutated = True
        if record.workspace_mount and "mount" not in paths:
            paths["mount"] = record.workspace_mount
            mutated = True
        if record.workspace_session and "session_id" not in paths:
            paths["session_id"] = record.workspace_session
            mutated = True
        if mutated:
            workspace_info["paths"] = paths
        git_info = workspace_info.get("git")
        git_mutated = False
        if not isinstance(git_info, dict):
            git_info = {}
        if record.git_commit and "commit" not in git_info:
            git_info["commit"] = record.git_commit
            git_mutated = True
        if record.git_dirty is not None and "is_dirty" not in git_info:
            git_info["is_dirty"] = record.git_dirty == "1"
            git_mutated = True
        if git_mutated:
            workspace_info["git"] = git_info
        if workspace_info:
            data["workspace"] = workspace_info
        return data

    def _cleanup_workspace(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        workspace = payload.get("workspace")
        if not isinstance(workspace, dict):
            return {"removed": False}
        paths = workspace.get("paths")
        if not isinstance(paths, dict):
            return {"removed": False}
        internal_root = paths.get("internal_root") or paths.get("internalRoot")
        session_id = paths.get("session_id") or paths.get("sessionId")
        summary: Dict[str, Any] = {"removed": False}
        if not isinstance(internal_root, str) or not internal_root.strip():
            return summary

        try:
            resolved_root = Path(internal_root).resolve()
        except (OSError, RuntimeError) as exc:
            summary.update({"error": str(exc), "path": internal_root})
            return summary

        base_dir = get_config().workspace.resolve_path()
        try:
            resolved_root.relative_to(base_dir)
        except ValueError:
            summary.update(
                {
                    "error": "workspace outside configured root",
                    "path": str(resolved_root),
                }
            )
            return summary

        if resolved_root == base_dir:
            summary.update(
                {"error": "refusing to delete workspace root", "path": str(resolved_root)}
            )
            return summary

        summary["path"] = str(resolved_root)
        if resolved_root.exists():
            try:
                shutil.rmtree(resolved_root)
                summary["removed"] = True
            except OSError as exc:
                summary["error"] = str(exc)

        deployments_removed: List[str] = []
        if isinstance(session_id, str) and session_id.strip():
            deployments_root = base_dir / "deployments" / session_id.strip()
            try:
                resolved_deployments = deployments_root.resolve()
            except (OSError, RuntimeError):
                resolved_deployments = deployments_root
            if resolved_deployments.exists():
                try:
                    shutil.rmtree(resolved_deployments)
                    deployments_removed.append(str(resolved_deployments))
                except OSError as exc:
                    summary.setdefault("deployment_errors", []).append(str(exc))
        if deployments_removed:
            summary["deployments_removed"] = deployments_removed
        return summary


_store_lock = threading.Lock()
_store_instance: Optional[ConversationStore] = None
_store_signature: Optional[Tuple[str, bool, Optional[int]]] = None


def _signature(config: ConversationStoreConfig) -> Tuple[str, bool, Optional[int]]:
    return (config.effective_url(), config.echo, config.pool_size)


def get_conversation_store() -> ConversationStore:
    global _store_instance, _store_signature
    config = get_config().conversation_store
    signature = _signature(config)
    with _store_lock:
        if _store_instance is None or _store_signature != signature:
            logger.info(
                "Creating conversation store (url=%s echo=%s pool=%s)",
                signature[0],
                signature[1],
                signature[2],
            )
            _store_instance = ConversationStore(config)
            _store_signature = signature
    return _store_instance
