"""Session-scoped workspace management for tool sandboxes."""

from __future__ import annotations

import logging
import os
import secrets
import subprocess
import tempfile
import shutil
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Dict, List, Optional

LEGACY_MOUNT_PATH = "/mnt/okcomputer/"
LEGACY_OUTPUT_PATH = "/mnt/okcomputer/output/"


class WorkspaceError(RuntimeError):
    """Raised when a workspace path cannot be resolved safely."""


logger = logging.getLogger(__name__)


class WorkspaceStateError(WorkspaceError):
    """Raised when snapshotting or restoring workspace state fails."""


class _NullWorkspaceState:
    """Fallback implementation when Git snapshots are unavailable."""

    enabled: bool = False

    def snapshot(self, label: Optional[str] = None) -> None:  # noqa: D401 - interface compat
        return None

    def list_snapshots(self, limit: int = 20) -> List[Dict[str, object]]:  # noqa: D401 - interface compat
        return []

    def restore(self, snapshot_id: str) -> bool:  # noqa: D401 - interface compat
        return False


class GitWorkspaceState:
    """Git-backed workspace state manager to support time travel."""

    def __init__(self, root: Path) -> None:
        self._root = root
        self.enabled = shutil.which("git") is not None
        self._initialised = False
        if not self.enabled:
            logger.warning("Git executable not found; workspace snapshots disabled")
            return
        try:
            self._initialise_repo()
        except (OSError, subprocess.CalledProcessError) as exc:  # pragma: no cover - defensive
            logger.warning("Failed to initialise Git repository for workspace: %s", exc)
            self.enabled = False

    # --- internal helpers -------------------------------------------------
    def _git_env(self) -> Dict[str, str]:
        env = os.environ.copy()
        env.setdefault("GIT_CONFIG_NOSYSTEM", "1")
        env.setdefault("GIT_CONFIG_GLOBAL", os.devnull)
        env.setdefault("GIT_CONFIG_SYSTEM", os.devnull)
        env.setdefault("GIT_AUTHOR_NAME", "OKC Workspace")
        env.setdefault("GIT_AUTHOR_EMAIL", "workspace@okcvm.local")
        env.setdefault("GIT_COMMITTER_NAME", env["GIT_AUTHOR_NAME"])
        env.setdefault("GIT_COMMITTER_EMAIL", env["GIT_AUTHOR_EMAIL"])
        env.setdefault("GIT_DIR", str(self._root / ".git"))
        env.setdefault("GIT_WORK_TREE", str(self._root))
        return env

    def _run_git(self, *args: str, capture_output: bool = False) -> subprocess.CompletedProcess[str]:
        if not self.enabled:
            raise WorkspaceStateError("Workspace snapshots are disabled")
        return subprocess.run(  # noqa: S603 - controlled arguments
            ["git", *args],
            check=True,
            text=True,
            capture_output=capture_output,
            env=self._git_env(),
        )

    def _initialise_repo(self) -> None:
        if (self._root / ".git").exists():
            self._initialised = True
            return

        init_env = os.environ.copy()
        init_env.setdefault("GIT_CONFIG_NOSYSTEM", "1")
        init_env.setdefault("GIT_CONFIG_GLOBAL", os.devnull)
        init_env.setdefault("GIT_CONFIG_SYSTEM", os.devnull)

        subprocess.run(  # noqa: S603 - controlled arguments
            ["git", "init", str(self._root)],
            check=True,
            text=True,
            capture_output=True,
            env=init_env,
        )

        self._run_git("config", "--local", "user.name", "OKC Workspace")
        self._run_git("config", "--local", "user.email", "workspace@okcvm.local")
        self._run_git("add", "-A")
        self._run_git("commit", "--allow-empty", "-m", "Initial workspace state")
        self._initialised = True

    # --- public API -------------------------------------------------------
    def snapshot(self, label: Optional[str] = None) -> Optional[str]:
        """Create a snapshot of the current workspace state."""

        if not self.enabled:
            return None

        message = (label or "Workspace snapshot").strip()
        if not message:
            message = "Workspace snapshot"
        message = " ".join(message.split())

        self._run_git("add", "-A")
        self._run_git("commit", "--allow-empty", "-m", message)
        head = self._run_git("rev-parse", "HEAD", capture_output=True)
        return head.stdout.strip()

    def list_snapshots(self, limit: int = 20) -> List[Dict[str, object]]:
        """Return recent snapshots sorted from newest to oldest."""

        if not self.enabled:
            return []

        log = self._run_git(
            "log",
            f"-n{limit}",
            "--pretty=format:%H%x1f%ct%x1f%s",
            capture_output=True,
        )
        entries = []
        for line in log.stdout.strip().splitlines():
            parts = line.split("\x1f", maxsplit=2)
            if len(parts) != 3:
                continue
            commit, timestamp, summary = parts
            try:
                ts = datetime.fromtimestamp(int(timestamp))
            except ValueError:  # pragma: no cover - defensive parsing
                ts = datetime.fromtimestamp(0)
            entries.append(
                {
                    "id": commit,
                    "label": summary,
                    "timestamp": ts.isoformat(timespec="seconds"),
                }
            )
        return entries

    def restore(self, snapshot_id: str) -> bool:
        """Restore the workspace to the provided snapshot."""

        if not self.enabled:
            return False
        try:
            self._run_git("rev-parse", snapshot_id)
        except subprocess.CalledProcessError as exc:
            raise WorkspaceStateError(f"Unknown snapshot: {snapshot_id}") from exc

        self._run_git("reset", "--hard", snapshot_id)
        self._run_git("clean", "-fd")
        return True


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

        self._cleaned = False
        self._session_id = mount_path.name
        candidate_state = GitWorkspaceState(internal_root)
        self.state = candidate_state if candidate_state.enabled else _NullWorkspaceState()

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
            except ValueError:
                # The agent is using a generic absolute path (e.g. "/tmp/foo").
                # Anchor it inside the session workspace so that the random
                # workspace identifier does not need to be known a priori.
                parts = posix_path.parts[1:]
                relative = PurePosixPath(*parts)
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

        prompt = prompt.replace(LEGACY_OUTPUT_PATH, f"{output_str}/")
        prompt = prompt.replace(LEGACY_MOUNT_PATH, f"{mount_str}/")
        return prompt

    def cleanup(self) -> bool:
        """Remove the workspace directory from disk.

        Returns ``True`` if the directory existed and was removed, otherwise
        ``False``. Subsequent calls are no-ops.
        """

        if self._cleaned:
            return False

        internal_root = self._paths.internal_root
        if not internal_root.exists():
            self._cleaned = True
            return False

        try:
            shutil.rmtree(internal_root)
        except OSError as exc:  # pragma: no cover - defensive guard
            raise WorkspaceError(f"Failed to remove workspace: {exc}") from exc

        self._cleaned = True
        return True

