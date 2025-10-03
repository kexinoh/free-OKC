from __future__ import annotations

import copy
from itertools import count
from typing import Any, Dict, List
from uuid import uuid4

from langchain_core.messages import AIMessage, HumanMessage

from . import spec
from .logging_utils import get_logger
from .llm import create_llm_chain  # 导入我们新的 chain 创建函数
from .registry import ToolRegistry
from .tools.base import ToolResult


logger = get_logger(__name__)


class VirtualMachine:
    """Orchestrates LLM interactions and tool usage using LangChain."""

    def __init__(
        self,
        system_prompt: str,
        registry: ToolRegistry,
    ) -> None:
        self.system_prompt = system_prompt
        self.registry = registry
        # 注意：history现在需要遵循LangChain的BaseMessage格式
        self.history: List[Dict[str, Any]] = []
        self._chain = None  # 延迟初始化 chain
        self._last_tool_result: ToolResult | None = None
        workspace = getattr(self.registry, "workspace", None)
        if workspace is not None and hasattr(workspace, "session_id"):
            self._history_prefix = workspace.session_id
        else:
            self._history_prefix = uuid4().hex[:8]
        self._history_id_counter = count(1)
        logger.debug("VirtualMachine initialised")

    @property
    def chain(self):
        """Lazy-loads the LangChain agent executor."""
        if self._chain is None:
            logger.info("Creating LangChain agent executor")
            self._chain = create_llm_chain(self.registry)
            logger.info("LangChain agent executor created successfully")
        return self._chain

    def reset_history(self) -> None:
        """Clears the conversation history."""
        self.history.clear()
        self._last_tool_result = None
        self._history_id_counter = count(1)
        logger.debug("VM history has been reset")

    def execute(self, utterance: str) -> Dict[str, Any]:
        """
        Processes a user utterance using the LangChain agent.
        Handles LLM calls and tool executions.
        """
        logger.info("Executing utterance: %s", utterance[:200])
        
        # 将历史转换为 LangChain 格式
        langchain_history: List[Any] = []
        for msg in self.history:
            role = msg.get("role")
            content = msg.get("content")
            if content is None:
                continue
            if role == "user":
                langchain_history.append(HumanMessage(content=content))
            elif role == "assistant":
                langchain_history.append(AIMessage(content=content))

        # 调用 LangChain Agent Executor
        try:
            response = self.chain.invoke({
                "input": utterance,
                "history": langchain_history
            })
        except Exception as e:
            # 捕获并返回错误信息，防止服务崩溃
            logger.exception("Error invoking LangChain agent")
            return {
                "reply": f"An error occurred: {e}",
                "tool_calls": [],
            }
        
        # 从 Agent 的响应中提取最终答复
        final_reply = response.get("output", "I'm not sure how to respond to that.")
        
        # 更新我们的内部历史记录
        self.record_history_entry({"role": "user", "content": utterance})
        self.record_history_entry({"role": "assistant", "content": final_reply})
        
        # 从LangChain的中间步骤提取工具调用信息（可选，但对于调试很有用）
        tool_calls_info = []
        if "intermediate_steps" in response:
            for step in response["intermediate_steps"]:
                action, observation = step
                tool_calls_info.append({
                    "tool_name": action.tool,
                    "tool_input": action.tool_input,
                    "tool_output": observation
                })

        logger.debug(
            "Utterance processed (reply_length=%s tool_calls=%s)",
            len(final_reply),
            len(tool_calls_info),
        )

        return {
            "reply": final_reply,
            "tool_calls": tool_calls_info,
        }

    def call_tool(self, name: str, **kwargs: Any) -> ToolResult:
        """Invoke a tool directly through the registry."""

        logger.debug("Calling tool %s with args=%s", name, list(kwargs.keys()))
        result = self.registry.call(name, **kwargs)
        self._last_tool_result = result
        self.record_history_entry(
            {
                "role": "tool",
                "name": name,
                "input": kwargs,
                "success": result.success,
                "output": result.output,
                "data": result.data,
            }
        )
        logger.debug("Tool call recorded: %s success=%s", name, result.success)
        return result

    def last_result(self) -> ToolResult | None:
        """Return the most recent tool call result."""

        return self._last_tool_result

    def get_history(self) -> List[Dict[str, Any]]:
        """Return a deep copy of the internal history to prevent mutation."""
        return copy.deepcopy(self.history)

    def _next_history_id(self) -> str:
        return f"{self._history_prefix}-{next(self._history_id_counter):04d}"

    def record_history_entry(self, entry: Dict[str, Any]) -> Dict[str, Any]:
        stored = dict(entry)
        stored.setdefault("id", self._next_history_id())
        self.history.append(stored)
        return stored

    def get_history_entry(self, entry_id: str) -> Dict[str, Any] | None:
        for item in reversed(self.history):
            if item.get("id") == entry_id:
                return copy.deepcopy(item)
        return None

    def describe(self) -> Dict[str, object]:
        description = {
            "system_prompt": self.system_prompt,
            "tools": [tool.name for tool in self.registry.get_langchain_tools()],
            "history_length": len(self.history),
        }
        workspace = getattr(self.registry, "workspace", None)
        if workspace is not None:
            paths = workspace.paths
            description["workspace_id"] = workspace.session_id
            description["workspace_mount"] = str(paths.mount)
            description["workspace_output"] = str(paths.output)
        description["history_namespace"] = self._history_prefix
        return description

    def describe_history(self, limit: int = 25) -> List[Dict[str, object]]:
        return self.history[-limit:]
