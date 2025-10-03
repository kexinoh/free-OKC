"""Session-scoped workspace management for tool sandboxes."""

from __future__ import annotations

import os
import secrets
import tempfile
from dataclasses import dataclass
from pathlib import Path, PurePosixPath


class WorkspaceError(RuntimeError):
    """Raised when a workspace path cannot be resolved safely."""


@dataclass(frozen=True)
class WorkspacePaths:
    """Holds both public (agent-facing) and internal workspace paths."""

    mount: PurePosixPath
    output: PurePosixPath
    internal_root: Path
    internal_output: Path
    session_id: str


class WorkspaceManager:
    """Create and resolve session-specific workspace directories."""

    def __init__(
        self,
        *,
        base_dir: Path | None = None,
        mount_root: PurePosixPath | str = PurePosixPath("/mnt"),
        prefix: str = "okcvm",
    ) -> None:
        token = secrets.token_hex(8)
        mount_root_path = (
            mount_root if isinstance(mount_root, PurePosixPath) else PurePosixPath(mount_root)
        )
        mount_path = mount_root_path / f"{prefix}-{token}"

        storage_root = base_dir or Path(tempfile.gettempdir()) / "okcvm" / "sessions"
        internal_root = (storage_root / mount_path.name).resolve()
        internal_output = internal_root / "output"

        internal_output.mkdir(parents=True, exist_ok=True)

        self._paths = WorkspacePaths(
            mount=mount_path,
            output=mount_path / "output",
            internal_root=internal_root,
            internal_output=internal_output,
            session_id=mount_path.name,
        )
        self._session_id = mount_path.name

    @property
    def paths(self) -> WorkspacePaths:
        return self._paths

    @property
    def session_id(self) -> str:
        """Return the unique session identifier tied to this workspace."""
        return self._paths.session_id

    def resolve(self, raw_path: str) -> Path:
        """Map a user-provided path to the internal workspace location."""

        if not raw_path:
            raise WorkspaceError("file_path cannot be empty")

        normalised = raw_path.replace("\\", "/") if os.name == "nt" else raw_path
        posix_path = PurePosixPath(normalised)

        if posix_path.is_absolute():
            try:
                relative = posix_path.relative_to(self._paths.mount)
            except ValueError as exc:
                raise WorkspaceError(
                    f"Path '{raw_path}' is outside of the session workspace {self._paths.mount}"
                ) from exc
        else:
            relative = posix_path

        candidate = (self._paths.internal_root / Path(*relative.parts)).resolve()

        try:
            candidate.relative_to(self._paths.internal_root)
        except ValueError as exc:  # pragma: no cover - defensive guard
            raise WorkspaceError("Resolved path escapes the session workspace") from exc

        return candidate

    def adapt_prompt(self, prompt: str) -> str:
        """Replace legacy mount instructions in the system prompt."""

        mount_str = str(self._paths.mount)
        output_str = str(self._paths.output)

        prompt = prompt.replace("/mnt/okcomputer/output/", f"{output_str}/")
        prompt = prompt.replace("/mnt/okcomputer/", f"{mount_str}/")
        return prompt

