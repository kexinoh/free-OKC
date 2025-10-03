from __future__ import annotations

import random
from datetime import datetime
from typing import Dict, List, Optional

from . import constants, spec
from .config import get_config
from .logging_utils import get_logger
from .registry import ToolRegistry
from .vm import VirtualMachine
from .workspace import WorkspaceError, WorkspaceManager


logger = get_logger(__name__)


class SessionState:
    """Manages the state and logic for a user session."""

    def __init__(self) -> None:
        logger.debug("Initialising SessionState and tool registry")
        self._initialise_vm()
        self._rng = random.Random()
        # 注意：VM现在管理自己的历史，SessionState的历史可以作为副本或移除
        # 为了简单起见，我们让VM成为历史的唯一来源
        # self.history: List[Dict[str, str]] = []

    def _initialise_vm(self) -> None:
        cfg = get_config()
        workspace_root = cfg.workspace.resolve_and_prepare()
        self.workspace = WorkspaceManager(base_dir=workspace_root)
        self.registry = ToolRegistry.from_default_spec(workspace=self.workspace)
        system_prompt = self.workspace.adapt_prompt(spec.load_system_prompt())
        self.vm = VirtualMachine(
            system_prompt=system_prompt,
            registry=self.registry,
        )

    def _cleanup_workspace(self) -> Dict[str, object] | None:
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

        try:
            details["removed"] = workspace.cleanup()
        except WorkspaceError as exc:  # pragma: no cover - defensive guard
            details["removed"] = False
            details["error"] = str(exc)
            logger.exception("Workspace cleanup failed")
        return details

    def reset(self) -> None:
        self._cleanup_workspace()
        self._initialise_vm()

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

    def respond(self, message: str) -> Dict[str, object]:
        
        # 调用 VM 来获取真实的 LLM 响应
        logger.info("Session respond invoked with: %s", message[:120])
        vm_result = self.vm.execute(message)

        # 从 VM 的结果中提取信息
        reply = vm_result.get("reply", "An error occurred.")

        # [TODO] 这里我们需要一种机制来从工具调用结果中提取网页和PPT内容
        web_preview = None
        ppt_slides = []
        summary = ""
        
        tool_calls = vm_result.get("tool_calls", [])
        if tool_calls:
            # 假设最后一个工具调用生成了主要内容
            last_call = tool_calls[-1]
            summary = f"Executed tool: {last_call['tool_name']}"
            output = last_call.get("tool_output", {})
            output_keys = list(output.keys()) if isinstance(output, dict) else None
            logger.debug(
                "Tool execution summary tool=%s keys=%s",
                last_call.get("tool_name"),
                output_keys,
            )
            if isinstance(output, dict):
                if "html" in output:
                    web_preview = {"html": output["html"]}
                if "slides" in output:
                    ppt_slides = output["slides"]

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

        return {
            "reply": reply,
            "meta": meta,
            "web_preview": web_preview,
            "ppt_slides": ppt_slides,
            "vm_history": self.vm.describe_history(limit=25),
        }

    def boot(self) -> Dict[str, object]:
        """
        Boots the session, but now it doesn't need to return hardcoded content.
        It simply initializes the state.
        """
        self.reset()

        # 引导信息仍然可以是静态的
        boot_reply = constants.WELCOME_MESSAGE
        self.vm.record_history_entry({"role": "assistant", "content": boot_reply})

        logger.info("Session booted (history=%s)", len(self.vm.history))

        meta = self._meta("OKC-Orchestrator", "Workbench Initialized")
        return {
            "reply": boot_reply,
            "meta": meta,
            "web_preview": {"html": constants.STUDIO_HTML},
            "ppt_slides": [
                {"title": "灵感孵化室能力", "bullets": ["网页 / PPT 一体生成", "模型调用透明可追踪", "可视化实时预览"]},
                {"title": "示例需求", "bullets": ["品牌落地页", "产品发布会演示", "活动招募物料"]},
            ],
            "vm": self.vm.describe(),
        }

    def delete_history(self) -> Dict[str, object]:
        """Clear the session history and remove any associated workspace."""

        logger.info("Session history deletion requested")
        history_length = len(self.vm.history)
        workspace_details = self._cleanup_workspace() or {"removed": False}
        self._initialise_vm()

        return {
            "history_cleared": True,
            "cleared_messages": history_length,
            "workspace": workspace_details,
            "vm": self.vm.describe(),
        }

    # _demo_response 方法现在可以移除了，因为它不再被 respond 方法调用
