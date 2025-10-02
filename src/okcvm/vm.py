"""High-level virtual machine facade for interacting with tools."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from typing import Any, Deque, Dict, List, Optional

from .registry import ToolRegistry
from .tools.base import ToolResult


@dataclass
class ToolInvocation:
    name: str
    arguments: Dict[str, Any]
    result: ToolResult


class VirtualMachine:
    """Facade bundling the system prompt with a tool registry."""

    def __init__(self, system_prompt: str, registry: ToolRegistry):
        self.system_prompt = system_prompt
        self.registry = registry
        self.history: Deque[ToolInvocation] = deque(maxlen=1000)

    def call_tool(self, name: str, **kwargs) -> ToolResult:
        result = self.registry.call(name, **kwargs)
        self.history.append(ToolInvocation(name=name, arguments=kwargs, result=result))
        return result

    def describe(self) -> Dict[str, Any]:
        return {
            "system_prompt": self.system_prompt,
            "tools": self.registry.described_tools(),
        }

    def reset_history(self) -> None:
        self.history.clear()

    def get_history(self, limit: Optional[int] = None) -> List[ToolInvocation]:
        """Return a copy of the invocation history."""

        items = list(self.history)
        if limit is not None:
            return items[-limit:]
        return items

    def describe_history(self, limit: Optional[int] = None) -> List[Dict[str, Any]]:
        """Return a JSON-serialisable description of recent tool calls."""

        serialised: List[Dict[str, Any]] = []
        for invocation in self.get_history(limit):
            serialised.append(
                {
                    "name": invocation.name,
                    "arguments": invocation.arguments,
                    "result": {
                        "success": invocation.result.success,
                        "output": invocation.result.output,
                        "error": invocation.result.error,
                    },
                }
            )
        return serialised

    def last_result(self) -> Optional[ToolResult]:
        """Return the most recent tool result if present."""

        if not self.history:
            return None
        return self.history[-1].result
