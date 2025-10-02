"""High-level virtual machine facade for interacting with tools."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict

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
        self.history: list[ToolInvocation] = []

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
