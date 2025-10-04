from __future__ import annotations

import json
import os
import random
from datetime import datetime
from json import JSONDecodeError
from typing import Dict, List, Optional
from urllib.parse import parse_qsl, urlencode, urljoin, urlparse, urlunparse

from . import constants, spec
from .config import get_config
from .logging_utils import get_logger
from .registry import ToolRegistry
from .vm import VirtualMachine
from .tools.deployment import cleanup_deployments_for_session
from .workspace import WorkspaceError, WorkspaceManager, WorkspaceStateError


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
        workspace_config = cfg.workspace
        workspace_root = workspace_config.resolve_and_prepare()
        self.workspace = WorkspaceManager(
            base_dir=workspace_root,
            preview_base_url=workspace_config.preview_base_url,
        )
        self.registry = ToolRegistry.from_default_spec(workspace=self.workspace)
        system_prompt = self.workspace.adapt_prompt(spec.load_system_prompt())
        self.vm = VirtualMachine(
            system_prompt=system_prompt,
            registry=self.registry,
        )
        self._booted = False

    def _workspace_state_summary(self, *, latest: Optional[str] = None, limit: int = 10) -> Dict[str, object]:
        state = getattr(self.workspace, "state", None)
        enabled = bool(getattr(state, "enabled", False))
        if not enabled:
            return {"enabled": False, "snapshots": []}

        snapshots = state.list_snapshots(limit=limit) if state else []
        summary: Dict[str, object] = {"enabled": True, "snapshots": snapshots}
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

    def _preview_base_url(self) -> Optional[str]:
        workspace = getattr(self, "workspace", None)
        base_url = getattr(workspace, "preview_base_url", None)
        if not base_url:
            cfg = get_config()
            workspace_cfg = getattr(cfg, "workspace", None)
            base_url = getattr(workspace_cfg, "preview_base_url", None) if workspace_cfg else None
        if isinstance(base_url, str) and base_url.strip():
            candidate = base_url.strip()
        else:
            env_candidate = os.environ.get("OKCVM_PREVIEW_BASE_URL")
            candidate = env_candidate.strip() if isinstance(env_candidate, str) else None
        if candidate and "://" not in candidate:
            return f"https://{candidate}".rstrip("/")
        return candidate.rstrip("/") if isinstance(candidate, str) else None

    def _resolve_preview_url(self, url: str) -> str:
        candidate = (url or "").strip()
        if not candidate:
            return candidate

        parsed = urlparse(candidate)
        if parsed.scheme and parsed.netloc:
            return candidate

        base = self._preview_base_url()
        if not base:
            return candidate

        resolved = urljoin(f"{base}/", candidate.lstrip("/"))
        return resolved

    def _append_client_id_to_url(self, url: str) -> str:
        """Ensure the provided URL carries the associated client identifier."""

        client_id = getattr(self, "client_id", None)
        if not client_id:
            return url

        try:
            parsed = urlparse(url)
        except ValueError:
            return url

        preview_base = self._preview_base_url()
        preview_host = None
        if preview_base:
            preview_host = urlparse(preview_base).hostname

        if parsed.scheme and parsed.netloc:
            host = parsed.hostname
            allowed_hosts = {"127.0.0.1", "localhost", "0.0.0.0"}
            if preview_host:
                allowed_hosts.add(preview_host)
            if host and host not in allowed_hosts:
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

    def respond(self, message: str, *, replace_last: bool = False) -> Dict[str, object]:

        # 调用 VM 来获取真实的 LLM 响应
        logger.info("Session respond invoked with: %s", message[:120])
        if replace_last:
            removed = self.vm.discard_last_exchange()
            logger.debug("Discarded last exchange before regeneration: %s", removed)
        vm_result = self.vm.execute(message)

        # 从 VM 的结果中提取信息
        reply = vm_result.get("reply", "An error occurred.")

        # [TODO] 这里我们需要一种机制来从工具调用结果中提取网页和PPT内容
        web_preview = None
        ppt_slides = []
        summary = ""
        artifacts: List[Dict[str, object]] = []
        
        tool_calls = vm_result.get("tool_calls", [])
        if tool_calls:
            # 假设最后一个工具调用生成了主要内容
            last_call = tool_calls[-1]
            summary = f"Executed tool: {last_call['tool_name']}"
            output_payload = last_call.get("tool_output")
            parsed_payload: Dict[str, object] | None = None
            if isinstance(output_payload, dict):
                parsed_payload = output_payload
            elif isinstance(output_payload, str):
                try:
                    parsed_payload = json.loads(output_payload)
                except JSONDecodeError:
                    logger.debug("Tool output is not valid JSON; treating as raw text")
            output_keys = list(parsed_payload.keys()) if isinstance(parsed_payload, dict) else None
            logger.debug(
                "Tool execution summary tool=%s keys=%s",
                last_call.get("tool_name"),
                output_keys,
            )
            if isinstance(parsed_payload, dict):
                preview_details: Dict[str, str] = {}
                deployment_details: Dict[str, object] | None = None

                def _string_field(candidate: object) -> str | None:
                    if isinstance(candidate, str) and candidate.strip():
                        return candidate
                    return None

                def _maybe_update_preview(container: Dict[str, object]) -> None:
                    nonlocal ppt_slides, deployment_details
                    html_value = _string_field(
                        container.get("html")
                        or container.get("rendered_html")
                        or container.get("content")
                    )
                    if html_value:
                        preview_details["html"] = html_value
                    url_value = _string_field(
                        container.get("preview_url")
                        or container.get("url")
                        or container.get("href")
                        or container.get("server_preview_url")
                    )
                    if not url_value:
                        deployment_info = container.get("deployment")
                        if isinstance(deployment_info, dict):
                            url_value = _string_field(
                                deployment_info.get("preview_url")
                                or deployment_info.get("server_preview_url")
                            )
                    if url_value:
                        preview_details["url"] = url_value
                    deployment_info = container.get("deployment")
                    deployment_name = None
                    if isinstance(deployment_info, dict):
                        deployment_details = deployment_info
                        deployment_name = _string_field(
                            deployment_info.get("name")
                            or deployment_info.get("slug")
                        )

                    title_value = _string_field(
                        container.get("title")
                        or container.get("name")
                        or deployment_name
                    )
                    if title_value and "title" not in preview_details:
                        preview_details["title"] = title_value

                    slides_value = container.get("slides")
                    if isinstance(slides_value, list):
                        ppt_slides = slides_value

                _maybe_update_preview(parsed_payload)

                data_section = parsed_payload.get("data")
                if isinstance(data_section, dict):
                    _maybe_update_preview(data_section)

                if preview_details:
                    url_value = preview_details.get("url")
                    if isinstance(url_value, str) and url_value:
                        resolved_url = self._resolve_preview_url(url_value)
                        resolved_url = self._append_client_id_to_url(resolved_url)
                        preview_details["url"] = resolved_url
                        if isinstance(parsed_payload, dict):
                            parsed_payload["preview_url"] = resolved_url

                        if isinstance(deployment_details, dict) and resolved_url:
                            artifact_name = _string_field(
                                deployment_details.get("name")
                                or deployment_details.get("slug")
                                or preview_details.get("title")
                                or "Web preview"
                            )
                            artifact_entry: Dict[str, object] = {
                                "type": "web",
                                "url": resolved_url,
                            }
                            if artifact_name:
                                artifact_entry["name"] = artifact_name
                            deployment_id = deployment_details.get("id")
                            if isinstance(deployment_id, (str, int)):
                                artifact_entry["deployment_id"] = str(deployment_id)
                            artifacts.append(artifact_entry)
                    web_preview = preview_details

                output_text = parsed_payload.get("output")
                if isinstance(output_text, str) and output_text.strip():
                    summary = output_text.strip().splitlines()[0]

        # 使用真实数据填充响应
        cfg = get_config()
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
            "vm_history": self.vm.describe_history(limit=25),
            "workspace_state": workspace_state,
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
        }

    def snapshot_workspace(self, label: Optional[str] = None, *, limit: int = 20) -> Dict[str, object]:
        state = getattr(self.workspace, "state", None)
        if not getattr(state, "enabled", False):
            raise WorkspaceStateError("Workspace snapshots are disabled")

        snapshot_id = state.snapshot(label)
        return self._workspace_state_summary(latest=snapshot_id, limit=limit)

    def list_workspace_snapshots(self, *, limit: int = 20) -> Dict[str, object]:
        return self._workspace_state_summary(limit=limit)

    def restore_workspace(self, snapshot_id: str, *, limit: int = 20) -> Dict[str, object]:
        state = getattr(self.workspace, "state", None)
        if not getattr(state, "enabled", False):
            raise WorkspaceStateError("Workspace snapshots are disabled")

        state.restore(snapshot_id)
        return self._workspace_state_summary(latest=snapshot_id, limit=limit)

    # _demo_response 方法现在可以移除了，因为它不再被 respond 方法调用
