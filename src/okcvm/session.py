from __future__ import annotations

import json
import random
from datetime import datetime
from json import JSONDecodeError
from pathlib import PurePosixPath
from typing import Dict, List, Optional
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

from langchain_core.callbacks.base import BaseCallbackHandler

from . import constants, spec
from .config import WorkspaceConfig, get_config
from .logging_utils import get_logger
from .registry import ToolRegistry
from .vm import VirtualMachine
from .tools.deployment import cleanup_deployments_for_session
from .workspace import (
    GitWorkspaceState,
    WorkspaceError,
    WorkspaceManager,
    WorkspaceStateError,
)


logger = get_logger(__name__)


class SessionState:
    """Manages the state and logic for a user session."""

    def __init__(self) -> None:
        logger.debug("Initialising SessionState and tool registry")
        self._booted = False
        self._initialise_vm()
        self._rng = random.Random()
        self.client_id: Optional[str] = None
        # 注意：VM现在管理自己的历史，SessionState的历史可以作为副本或移除
        # 为了简单起见，我们让VM成为历史的唯一来源
        # self.history: List[Dict[str, str]] = []

    def _initialise_vm(self) -> None:
        cfg = get_config()
        workspace_root = cfg.workspace.resolve_and_prepare()
        self.workspace = WorkspaceManager(base_dir=workspace_root)
        self.registry = ToolRegistry.from_default_spec(workspace=self.workspace)
        self._uploaded_files: List[Dict[str, object]] = []
        self._base_system_prompt = self.workspace.adapt_prompt(spec.load_system_prompt())
        composed_prompt = self._compose_system_prompt()
        self.vm = VirtualMachine(
            system_prompt=composed_prompt,
            registry=self.registry,
        )
        self._booted = False

    def _format_file_size(self, size_bytes: int) -> str:
        if size_bytes < 0:
            size_bytes = 0
        if size_bytes >= 1024 * 1024:
            value = size_bytes / (1024 * 1024)
            value_str = f"{value:.2f}".rstrip("0").rstrip(".")
            return f"{value_str} MB"
        if size_bytes >= 1024:
            value = size_bytes / 1024
            value_str = f"{value:.2f}".rstrip("0").rstrip(".")
            return f"{value_str} KB"
        return f"{size_bytes} B"

    def _compose_system_prompt(self) -> str:
        base_prompt = getattr(self, "_base_system_prompt", "")
        base_prompt = base_prompt.strip() or "You are a helpful assistant."

        if not getattr(self, "_uploaded_files", None):
            return base_prompt

        lines = ["", "## 用户上传的文件", ""]
        for entry in self._uploaded_files:
            name = entry.get("name", "")
            display_path = entry.get("display_path") or str(entry.get("path", "")).lstrip("/")
            size_display = entry.get("size_display") or self._format_file_size(int(entry.get("size_bytes", 0)))
            lines.append(f"- 用户上传了文件 {name}，位于 {display_path}，大小为 {size_display}")

        return "\n".join([base_prompt.rstrip(), *lines]).strip()

    def _refresh_system_prompt(self) -> None:
        composed = self._compose_system_prompt()
        self.vm.update_system_prompt(composed)

    def list_uploaded_files(self) -> List[Dict[str, object]]:
        return [dict(entry) for entry in getattr(self, "_uploaded_files", [])]

    def uploaded_file_count(self) -> int:
        return len(getattr(self, "_uploaded_files", []))

    def register_uploaded_files(self, files: List[Dict[str, object]]) -> Dict[str, object]:
        if not isinstance(files, list):
            return {
                "files": self.list_uploaded_files(),
                "summaries": [],
                "system_prompt": self.vm.system_prompt,
            }

        index_by_name = {entry["name"]: idx for idx, entry in enumerate(self._uploaded_files)}
        summaries: List[str] = []

        for payload in files:
            name_raw = payload.get("name")
            name = str(name_raw).strip() if isinstance(name_raw, str) else ""
            if not name:
                continue

            relative_hint = payload.get("relative_path")
            relative_path = (
                PurePosixPath(str(relative_hint).strip())
                if isinstance(relative_hint, str) and relative_hint.strip()
                else PurePosixPath(name)
            )

            try:
                size_bytes = int(payload.get("size_bytes", 0))
            except (TypeError, ValueError):
                size_bytes = 0
            size_bytes = max(size_bytes, 0)

            mount_path = self.workspace.paths.mount / relative_path
            display_path = str(mount_path).lstrip("/")
            size_display = self._format_file_size(size_bytes)

            record = {
                "name": name,
                "relative_path": str(relative_path),
                "path": str(mount_path),
                "display_path": display_path,
                "size_bytes": size_bytes,
                "size_display": size_display,
            }

            if name in index_by_name:
                self._uploaded_files[index_by_name[name]] = record
                summaries.append(
                    f"用户更新了文件 {name}，位于 {display_path}，大小为 {size_display}"
                )
            else:
                self._uploaded_files.append(record)
                index_by_name[name] = len(self._uploaded_files) - 1
                summaries.append(
                    f"用户上传了文件 {name}，位于 {display_path}，大小为 {size_display}"
                )

        self._refresh_system_prompt()

        return {
            "files": self.list_uploaded_files(),
            "summaries": summaries,
            "system_prompt": self.vm.system_prompt,
        }

    def _workspace_state_summary(self, *, latest: Optional[str] = None, limit: int = 10) -> Dict[str, object]:
        state = getattr(self.workspace, "state", None)
        enabled = bool(getattr(state, "enabled", False))
        if not enabled:
            return {"enabled": False, "snapshots": []}

        snapshots = state.list_snapshots(limit=limit) if state else []
        summary: Dict[str, object] = {"enabled": True, "snapshots": snapshots}

        workspace = getattr(self, "workspace", None)
        if workspace is not None:
            paths = getattr(workspace, "paths", None)
            if paths is not None:
                path_summary: Dict[str, object] = {
                    "mount": str(paths.mount),
                    "output": str(paths.output),
                    "internal_root": str(paths.internal_root),
                    "internal_output": str(paths.internal_output),
                    "internal_mount": str(getattr(paths, "internal_mount", paths.internal_root / "mnt")),
                    "internal_tmp": str(getattr(paths, "internal_tmp", paths.internal_root / "tmp")),
                    "session_id": getattr(paths, "session_id", None),
                }
                storage_root = getattr(workspace, "storage_root", None)
                if storage_root is not None:
                    path_summary["storage_root"] = str(storage_root)
                deployments_root = getattr(workspace, "deployments_root", None)
                if deployments_root is not None:
                    path_summary["deployments_root"] = str(deployments_root)
                summary["paths"] = path_summary

            if isinstance(state, GitWorkspaceState):
                git_summary = state.describe_head()
                if git_summary:
                    summary["git"] = git_summary

        if latest:
            summary["latest_snapshot"] = latest
        elif snapshots:
            summary["latest_snapshot"] = snapshots[0]["id"]
        return summary

    def _cleanup_workspace(self, *, remove_deployments: bool = False) -> Dict[str, object] | None:
        workspace = getattr(self, "workspace", None)
        if workspace is None:
            return None

        paths = workspace.paths
        details: Dict[str, object] = {
            "mount": str(paths.mount),
            "output": str(paths.output),
            "internal_root": str(paths.internal_root),
            "internal_output": str(paths.internal_output),
            "internal_mount": str(getattr(paths, "internal_mount", paths.internal_root / "mnt")),
            "internal_tmp": str(getattr(paths, "internal_tmp", paths.internal_root / "tmp")),
        }

        session_id = workspace.session_id
        try:
            details["removed"] = workspace.cleanup()
        except WorkspaceError as exc:  # pragma: no cover - defensive guard
            details["removed"] = False
            details["error"] = str(exc)
            logger.exception("Workspace cleanup failed")
        if remove_deployments:
            deployment_summary = cleanup_deployments_for_session(
                workspace.deployments_root, session_id
            )
            details["deployments"] = deployment_summary
        return details

    def reset(self) -> None:
        self._cleanup_workspace()
        self._initialise_vm()

    def attach_client(self, client_id: str) -> None:
        """Associate the session state with a specific client identifier."""

        cleaned = (client_id or "").strip()
        self.client_id = cleaned or "default"

    def _append_client_id_to_url(self, url: str) -> str:
        """Ensure the provided URL carries the associated client identifier."""

        client_id = getattr(self, "client_id", None)
        if not client_id:
            return url

        try:
            parsed = urlparse(url)
        except ValueError:
            return url

        if parsed.scheme and parsed.netloc:
            host = parsed.hostname
            if host and host not in {"127.0.0.1", "localhost", "0.0.0.0"}:
                return url

        query = dict(parse_qsl(parsed.query, keep_blank_values=True))
        if query.get("client_id"):
            return url

        query["client_id"] = client_id
        new_query = urlencode(query, doseq=True)
        updated = parsed._replace(query=new_query)
        return urlunparse(updated)

    def _meta(self, model: str, summary: str) -> Dict[str, str]:
        # 这个方法可以保留，用于生成前端需要的元数据
        now = datetime.now()
        return {
            "model": model,
            "timestamp": now.strftime("%H:%M:%S"),
            "tokensIn": f"{self._rng.randint(120, 320)} tokens",
            "tokensOut": f"{self._rng.randint(180, 420)} tokens",
            "latency": f"{self._rng.uniform(1.0, 2.2):.2f} s",
            "summary": summary,
        }

    def respond(
        self,
        message: str,
        *,
        replace_last: bool = False,
        stream_handler: BaseCallbackHandler | None = None,
    ) -> Dict[str, object]:

        # 调用 VM 来获取真实的 LLM 响应
        logger.info("Session respond invoked with: %s", message[:120])
        if replace_last:
            removed = self.vm.discard_last_exchange()
            logger.debug("Discarded last exchange before regeneration: %s", removed)
        if stream_handler is not None:
            vm_result = self.vm.execute(message, callbacks=[stream_handler])
        else:
            vm_result = self.vm.execute(message)

        # 从 VM 的结果中提取信息
        reply = vm_result.get("reply", "An error occurred.")

        cfg = get_config()
        workspace_cfg = getattr(cfg, "workspace", WorkspaceConfig()) if hasattr(cfg, "workspace") else WorkspaceConfig()
        preview_base_url = getattr(workspace_cfg, "preview_base_url", None)

        web_preview: Dict[str, str] = {}
        ppt_slides: List[Dict[str, object]] = []
        summary = ""
        artifacts: List[Dict[str, str]] = []

        def _string_field(candidate: object) -> str | None:
            if isinstance(candidate, str):
                stripped = candidate.strip()
                if stripped:
                    return stripped
            return None

        def _normalise_preview_url(url: str) -> str:
            candidate = url.strip()
            if not candidate:
                return candidate
            parsed = urlparse(candidate)
            if parsed.scheme and parsed.netloc:
                return candidate
            if preview_base_url:
                try:
                    return urljoin(preview_base_url, candidate)
                except ValueError:
                    logger.debug("Failed to join preview base URL %s with %s", preview_base_url, candidate)
            return candidate

        def _iter_containers(payload: Dict[str, object]) -> List[Dict[str, object]]:
            containers: List[Dict[str, object]] = []
            containers.append(payload)
            data_section = payload.get("data")
            if isinstance(data_section, dict):
                containers.append(data_section)
            return containers

        def _extract_artifacts(container: Dict[str, object]) -> List[Dict[str, str]]:
            collected: List[Dict[str, str]] = []
            raw_items = container.get("artifacts")
            if isinstance(raw_items, list):
                for item in raw_items:
                    if not isinstance(item, dict):
                        continue
                    url_value = _string_field(item.get("url"))
                    if not url_value:
                        continue
                    normalized = self._append_client_id_to_url(_normalise_preview_url(url_value))
                    collected.append(
                        {
                            "type": _string_field(item.get("type")) or "file",
                            "name": _string_field(item.get("name")) or "Artifact",
                            "url": normalized,
                        }
                    )
            return collected

        def _preview_from_container(container: Dict[str, object]) -> tuple[Dict[str, str] | None, List[Dict[str, object]] | None, List[Dict[str, str]]]:
            preview_bits: Dict[str, str] = {}
            slides: List[Dict[str, object]] | None = None
            collected_artifacts = _extract_artifacts(container)

            html_value = _string_field(
                container.get("html")
                or container.get("rendered_html")
                or container.get("content")
            )
            if html_value:
                preview_bits.setdefault("html", html_value)

            url_value = _string_field(
                container.get("preview_url")
                or container.get("url")
                or container.get("href")
                or container.get("server_preview_url")
            )

            deployment_info = container.get("deployment")
            if not url_value and isinstance(deployment_info, dict):
                url_value = _string_field(
                    deployment_info.get("preview_url")
                    or deployment_info.get("server_preview_url")
                )

            if url_value:
                normalized_url = self._append_client_id_to_url(_normalise_preview_url(url_value))
                preview_bits.setdefault("url", normalized_url)

                deployment_id = _string_field(container.get("deployment_id"))
                if not deployment_id and isinstance(deployment_info, dict):
                    deployment_id = _string_field(deployment_info.get("id"))
                if deployment_id:
                    preview_bits.setdefault("deployment_id", deployment_id)

                title_value = (
                    _string_field(container.get("title"))
                    or _string_field(container.get("name"))
                )
                if not title_value and isinstance(deployment_info, dict):
                    title_value = _string_field(deployment_info.get("name")) or _string_field(
                        deployment_info.get("slug")
                    )
                if title_value:
                    preview_bits.setdefault("title", title_value)

                preview_artifact = {
                    "type": "web",
                    "name": title_value or "Web preview",
                    "url": normalized_url,
                }
                if not any(
                    isinstance(item, dict) and _string_field(item.get("url")) == normalized_url
                    for item in collected_artifacts
                ):
                    collected_artifacts.insert(0, preview_artifact)
                else:
                    # Ensure artifact name/title consistency when already present
                    for item in collected_artifacts:
                        if _string_field(item.get("url")) == normalized_url:
                            item.setdefault("type", "web")
                            item.setdefault("name", title_value or "Web preview")

            slides_value = container.get("slides")
            if isinstance(slides_value, list) and slides_value:
                slides = slides_value

            return (preview_bits or None, slides, collected_artifacts)

        tool_calls = vm_result.get("tool_calls", [])
        parsed_tool_data: List[Dict[str, object]] = []
        for call in tool_calls:
            output_payload = call.get("tool_output")
            parsed_payload: Dict[str, object] | None = None
            if isinstance(output_payload, dict):
                parsed_payload = output_payload
            elif isinstance(output_payload, str):
                try:
                    parsed_payload = json.loads(output_payload)
                except JSONDecodeError:
                    logger.debug("Tool output is not valid JSON; treating as raw text")
            if isinstance(parsed_payload, dict):
                parsed_tool_data.append(parsed_payload)

        if parsed_tool_data:
            logger.debug("Parsed %s tool payloads for preview extraction", len(parsed_tool_data))

        seen_artifact_urls: set[str] = set()

        for payload in reversed(parsed_tool_data):
            for container in _iter_containers(payload):
                preview_candidate, slides_candidate, container_artifacts = _preview_from_container(container)

                for artifact in container_artifacts:
                    url_value = _string_field(artifact.get("url"))
                    if not url_value or url_value in seen_artifact_urls:
                        continue
                    seen_artifact_urls.add(url_value)
                    artifacts.append(
                        {
                            "type": artifact.get("type", "file"),
                            "name": artifact.get("name", "Artifact"),
                            "url": url_value,
                        }
                    )

                if preview_candidate:
                    for key, value in preview_candidate.items():
                        if key not in web_preview and value is not None:
                            web_preview[key] = value

                if not ppt_slides and slides_candidate:
                    ppt_slides = slides_candidate

            if not summary:
                output_text = payload.get("output")
                if isinstance(output_text, str) and output_text.strip():
                    summary = output_text.strip().splitlines()[0]

        if tool_calls and not summary:
            summary = f"Executed tool: {tool_calls[-1]['tool_name']}"

        if not web_preview:
            web_preview = None

        if not artifacts:
            artifacts = []

        if not ppt_slides:
            ppt_slides = []

        # 使用真实数据填充响应
        model_name = cfg.chat.model if cfg.chat else "Unconfigured chat model"
        meta = self._meta(model_name, summary)

        logger.info(
            "Session response ready (model=%s history=%s tool_calls=%s)",
            model_name,
            len(self.vm.history),
            len(tool_calls),
        )

        snapshot_id: Optional[str] = None
        state = getattr(self.workspace, "state", None)
        if getattr(state, "enabled", False):
            label_seed = message.strip().splitlines()[0] if message.strip() else "message"
            label = f"After: {label_seed[:60]}"
            snapshot_id = state.snapshot(label)

        workspace_state = self._workspace_state_summary(latest=snapshot_id)

        return {
            "reply": reply,
            "meta": meta,
            "web_preview": web_preview,
            "ppt_slides": ppt_slides,
            "artifacts": artifacts,
            "tool_calls": tool_calls,
            "vm_history": self.vm.describe_history(limit=25),
            "workspace_state": workspace_state,
            "uploads": self.list_uploaded_files(),
        }

    def boot(self) -> Dict[str, object]:
        """Return the welcome payload without resetting existing workspace state."""

        logger.info("Session boot requested (booted=%s)", self._booted)

        if not self._booted:
            boot_reply = constants.WELCOME_MESSAGE
            self.vm.record_history_entry({"role": "assistant", "content": boot_reply})
            self._booted = True
        else:
            history = self.vm.history
            if history and history[0].get("role") == "assistant":
                boot_reply = str(history[0].get("content", constants.WELCOME_MESSAGE))
            else:
                boot_reply = constants.WELCOME_MESSAGE

        logger.info("Session booted (history=%s)", len(self.vm.history))

        meta = self._meta("OKC-Orchestrator", "Workbench Initialized")
        workspace_state = self._workspace_state_summary()
        return {
            "reply": boot_reply,
            "meta": meta,
            "web_preview": {"html": constants.STUDIO_HTML},
            "ppt_slides": [
                {"title": "灵感孵化室能力", "bullets": ["网页 / PPT 一体生成", "模型调用透明可追踪", "可视化实时预览"]},
                {"title": "示例需求", "bullets": ["品牌落地页", "产品发布会演示", "活动招募物料"]},
            ],
            "artifacts": [],
            "vm": self.vm.describe(),
            "workspace_state": workspace_state,
            "uploads": self.list_uploaded_files(),
        }

    def delete_history(self) -> Dict[str, object]:
        """Clear the session history and remove any associated workspace."""

        logger.info("Session history deletion requested")
        history_length = len(self.vm.history)
        workspace_details = self._cleanup_workspace(remove_deployments=True) or {"removed": False}
        self._initialise_vm()

        return {
            "history_cleared": True,
            "cleared_messages": history_length,
            "workspace": workspace_details,
            "vm": self.vm.describe(),
            "uploads": self.list_uploaded_files(),
        }

    def snapshot_workspace(self, label: Optional[str] = None, *, limit: int = 20) -> Dict[str, object]:
        state = getattr(self.workspace, "state", None)
        if not getattr(state, "enabled", False):
            raise WorkspaceStateError("Workspace snapshots are disabled")

        snapshot_id = state.snapshot(label)
        return self._workspace_state_summary(latest=snapshot_id, limit=limit)

    def list_workspace_snapshots(self, *, limit: int = 20) -> Dict[str, object]:
        return self._workspace_state_summary(limit=limit)

    def restore_workspace(
        self,
        snapshot_id: Optional[str] = None,
        *,
        branch: Optional[str] = None,
        checkout: bool = True,
        limit: int = 20,
    ) -> Dict[str, object]:
        state = getattr(self.workspace, "state", None)
        if not getattr(state, "enabled", False):
            raise WorkspaceStateError("Workspace snapshots are disabled")

        state.restore(snapshot_id, branch=branch, checkout=checkout)
        latest = None
        if isinstance(state, GitWorkspaceState):
            head_meta = state.describe_head()
            latest = head_meta.get("commit")
        latest = latest or snapshot_id or branch
        return self._workspace_state_summary(latest=latest, limit=limit)

    def assign_workspace_branch(
        self,
        branch: str,
        snapshot_id: Optional[str] = None,
        *,
        checkout: bool = True,
        limit: int = 20,
    ) -> Dict[str, object]:
        state = getattr(self.workspace, "state", None)
        if not getattr(state, "enabled", False):
            raise WorkspaceStateError("Workspace snapshots are disabled")

        state.ensure_branch(branch, snapshot_id, checkout=checkout)
        latest = None
        if isinstance(state, GitWorkspaceState):
            head_meta = state.describe_head()
            latest = head_meta.get("commit")
        latest = latest or snapshot_id or branch
        return self._workspace_state_summary(latest=latest, limit=limit)

    # _demo_response 方法现在可以移除了，因为它不再被 respond 方法调用
