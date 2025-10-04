from __future__ import annotations

import json
import secrets
import shutil
import time
from pathlib import Path
import socket
import subprocess
import sys
from contextlib import closing
from typing import Any, Dict, List, Optional
from urllib.parse import quote

from ..workspace import WorkspaceError, WorkspaceManager
from .base import Tool, ToolError, ToolResult


class _ManifestDict(dict):
    """Dictionary wrapper that treats ``None`` server_info as missing."""

    def get(self, key, default=None):  # type: ignore[override]
        value = super().get(key, default)
        if key == "server_info" and value is None:
            return default
        return value


def _manifest_object_hook(obj):
    if "server_info" in obj and obj.get("server_info") is None:
        return _ManifestDict(obj)
    return obj


class ManifestJSONDecoder(json.JSONDecoder):
    """JSON decoder that protects optional ``server_info`` sections."""

    def __init__(self, *args, **kwargs):
        kwargs.setdefault("object_hook", _manifest_object_hook)
        super().__init__(*args, **kwargs)


def load_manifest(path: Path) -> dict:
    """Load a deployment manifest using :class:`ManifestJSONDecoder`."""

    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle, cls=ManifestJSONDecoder)


def _slugify(name: str) -> str:
    """为名称创建一个 URL 友好的 slug。"""
    cleaned = [char.lower() if char.isalnum() else "-" for char in name]
    slug = "".join(cleaned).strip("-") or "site"
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug


def _find_free_port(start_port: int = 8000) -> int:
    """
    查找一个从 start_port 开始的可用 TCP 端口。
    """
    port = start_port
    while True:
        with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
            try:
                s.bind(("", port))
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                return port
            except OSError:
                # 端口已被占用，尝试下一个
                port += 1
                if port > 65535:
                    raise RuntimeError("Could not find any free port.")


def _start_http_server(directory: Path, port: int) -> subprocess.Popen:
    """
    在后台为指定目录启动一个 Python HTTP 服务器。
    返回子进程对象。
    """
    process = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port)],
        cwd=directory,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(1)
    return process


def _load_index(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    if isinstance(data, list):
        filtered: List[Dict[str, Any]] = [entry for entry in data if isinstance(entry, dict)]
        return filtered
    return []


def _write_index(path: Path, entries: List[Dict[str, Any]]) -> None:
    path.write_text(json.dumps(entries, indent=2), encoding="utf-8")


def _generate_deployment_id(existing: set[str]) -> str:
    while True:
        token = secrets.randbelow(900000) + 100000
        deployment_id = str(token)
        if deployment_id not in existing:
            return deployment_id


def _summarise_manifest(manifest: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": manifest.get("id"),
        "name": manifest.get("name"),
        "slug": manifest.get("slug"),
        "timestamp": manifest.get("timestamp"),
        "preview_url": manifest.get("preview_url"),
        "server_info": manifest.get("server_info"),
        "target": manifest.get("target"),
    }


class DeployWebsiteTool(Tool):
    name = "mshtools-deploy_website"
    requires_workspace = True

    def __init__(self, spec, workspace: WorkspaceManager | None = None):
        super().__init__(spec)
        self._workspace = workspace or WorkspaceManager()
        self._deploy_root = self._workspace.deployments_root
        self._deploy_root.mkdir(parents=True, exist_ok=True)
        self._manifest_index = self._deploy_root / "manifest.json"
        self._server_process: Optional[subprocess.Popen] = None
        self._server_port: Optional[int] = None

    def _resolve_source(self, directory: str) -> Path:
        if not directory:
            raise ToolError("'directory' is required")
        raw = str(directory)
        candidate = Path(raw).expanduser()
        if candidate.is_absolute() and candidate.exists():
            return candidate.resolve()
        try:
            resolved = self._workspace.resolve(raw)
        except WorkspaceError:
            resolved = None
        if resolved and resolved.exists():
            return resolved
        if candidate.exists():
            return candidate.resolve()
        return candidate.resolve(strict=False)

    def _ensure_unique_target(self, deployment_id: str | None = None) -> tuple[str, Path]:
        existing = {path.name for path in self._deploy_root.iterdir() if path.is_dir()}
        if deployment_id and deployment_id not in existing:
            target = self._deploy_root / deployment_id
            return deployment_id, target
        deployment_id = _generate_deployment_id(existing)
        target = self._deploy_root / deployment_id
        return deployment_id, target

    def _ensure_server(self) -> tuple[Optional[subprocess.Popen], Optional[int]]:
        if self._server_process and self._server_process.poll() is None:
            return self._server_process, self._server_port
        port = _find_free_port()
        process = _start_http_server(self._deploy_root, port)
        self._server_process = process
        self._server_port = port
        return process, port

    def _update_index(self, manifest: Dict[str, Any]) -> None:
        entries = _load_index(self._manifest_index)
        entries = [entry for entry in entries if entry.get("id") != manifest.get("id")]
        entries.insert(0, _summarise_manifest(manifest))
        _write_index(self._manifest_index, entries)

    def call(self, **kwargs) -> ToolResult:  # type: ignore[override]
        directory = (
            kwargs.get("directory")
            or kwargs.get("path")
            or kwargs.get("local_dir")
            or kwargs.get("source_dir")
        )
        name = kwargs.get("site_name") or kwargs.get("name")
        force = bool(kwargs.get("force", False))
        start_server = bool(kwargs.get("start_server", True))

        source = self._resolve_source(directory)
        if not source.is_dir():
            raise ToolError(f"Directory not found: {source}")
        index = source / "index.html"
        if not index.exists():
            entry_hint = (
                kwargs.get("entry_file")
                or kwargs.get("entrypoint")
                or kwargs.get("index_file")
                or kwargs.get("index")
            )

            candidate_files: list[Path] = []
            if entry_hint:
                hinted = source / entry_hint
                if hinted.exists() and hinted.is_file():
                    candidate_files = [hinted]

            if not candidate_files:
                candidate_files = sorted(
                    [
                        path
                        for path in source.iterdir()
                        if path.is_file() and path.suffix.lower() in {".html", ".htm"}
                    ]
                )

            if len(candidate_files) == 1:
                shutil.copyfile(candidate_files[0], index)
            else:
                raise ToolError(
                    "index.html must exist in the specified directory or a single HTML file must be provided"
                )

        entry_path = "index.html"

        slug = _slugify(name or source.name)
        deployment_id, target = self._ensure_unique_target()
        if target.exists():
            if not force:
                raise ToolError(
                    f"Deployment target {target} already exists. Pass force=True to overwrite."
                )
            shutil.rmtree(target)

        shutil.copytree(source, target)

        manifest: Dict[str, Any] = {
            "id": deployment_id,
            "name": name or source.name,
            "slug": slug,
            "timestamp": int(time.time()),
            "source": str(source),
            "target": str(target),
            "session_id": self._workspace.session_id,
        }

        preview_url = f"/?s={deployment_id}&path={quote(entry_path)}"
        manifest["preview_url"] = preview_url
        manifest["entry_path"] = entry_path

        if start_server:
            try:
                process, port = self._ensure_server()
                server_preview_url = f"http://127.0.0.1:{port}/{deployment_id}/{entry_path}"
                manifest["server_info"] = {
                    "pid": process.pid if process else None,
                    "port": port,
                    "status": "running" if process and process.poll() is None else "unknown",
                }
                manifest["server_preview_url"] = server_preview_url
                output = (
                    "Deployment complete. Site is now available via the FastAPI preview endpoint.\n"
                    f"  Deployment ID: {deployment_id}\n"
                    f"  Preview URL: {preview_url}\n"
                    f"  Static server port: {port}\n"
                    f"  Direct server URL: {server_preview_url}"
                )
            except Exception as exc:  # pragma: no cover - defensive fallback
                manifest["server_info"] = {
                    "pid": None,
                    "port": None,
                    "status": "error",
                    "message": str(exc),
                }
                output = (
                    "Deployment complete, but failed to start auxiliary server.\n"
                    f"  Error: {exc}\n"
                    f"  Preview URL: {preview_url}\n"
                    f"  Manual fallback: serve {self._deploy_root} and open /{deployment_id}/{entry_path}"
                )
        else:
            manifest["server_info"] = None
            output = (
                "Deployment complete. Access via the FastAPI preview endpoint.\n"
                f"  Deployment ID: {deployment_id}\n"
                f"  Preview URL: {preview_url}"
            )

        deployment_manifest_path = target / "deployment.json"
        deployment_manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        self._update_index(manifest)

        data = {
            "deployment": manifest,
            "deployment_id": deployment_id,
            "manifest_path": str(deployment_manifest_path),
            "index_path": str(self._manifest_index),
            "target": manifest["target"],
            "preview_url": manifest["preview_url"],
        }
        return ToolResult(success=True, output=output, data=data)


def cleanup_deployments_for_session(root: Path, session_id: str) -> Dict[str, Any]:
    """Remove deployment artefacts associated with ``session_id``.

    Parameters
    ----------
    root:
        Persistent deployment root directory.
    session_id:
        Identifier of the workspace session whose deployments should be removed.

    Returns
    -------
    Dict[str, Any]
        Summary containing a list of removed deployment identifiers and
        optionally any errors encountered.
    """

    removed: List[str] = []
    errors: Dict[str, str] = {}

    if not root.exists() or not root.is_dir():
        return {"removed_ids": removed}

    for path in root.iterdir():
        if not path.is_dir():
            continue

        deployment_id = path.name
        manifest_path = path / "deployment.json"

        manifest_session: Optional[str] = None
        if manifest_path.exists():
            try:
                manifest = load_manifest(manifest_path)
            except (OSError, json.JSONDecodeError) as exc:
                errors[deployment_id] = str(exc)
                continue
            manifest_session = manifest.get("session_id")
            if manifest_session is not None:
                manifest_session = str(manifest_session)

        if manifest_session != session_id:
            continue

        try:
            shutil.rmtree(path)
        except OSError as exc:  # pragma: no cover - defensive guard
            errors[deployment_id] = str(exc)
        else:
            removed.append(deployment_id)

    if removed:
        index_path = root / "manifest.json"
        entries = _load_index(index_path)
        filtered = [entry for entry in entries if str(entry.get("id")) not in removed]
        _write_index(index_path, filtered)

    summary: Dict[str, Any] = {"removed_ids": removed}
    if errors:
        summary["errors"] = errors
    return summary


__all__ = ["DeployWebsiteTool", "cleanup_deployments_for_session"]
