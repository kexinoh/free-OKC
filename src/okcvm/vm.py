"""Lightweight virtual machine orchestration utilities."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from .registry import ToolRegistry
from .tools.base import ToolResult


@dataclass(slots=True)
class HistoryEntry:
    """Represents a single tool invocation."""

    name: str
    arguments: Dict[str, Any]
    result: ToolResult

    def describe(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "arguments": dict(self.arguments),
            "success": self.result.success,
            "output": self.result.output,
            "data": self.result.data,
        }


class VirtualMachine:
    """Simple coordinator that executes tools and records history."""

    def __init__(self, system_prompt: str, registry: ToolRegistry) -> None:
        self.system_prompt = system_prompt
        self.registry = registry
        self._history: List[HistoryEntry] = []
        self._last_result: Optional[ToolResult] = None

    def call_tool(self, name: str, /, **kwargs: Any) -> ToolResult:
        """Invoke a registered tool and record the interaction."""

        result = self.registry.call(name, **kwargs)
        entry = HistoryEntry(name=name, arguments=dict(kwargs), result=result)
        self._history.append(entry)
        self._last_result = result
        return result

    def last_result(self) -> Optional[ToolResult]:
        """Return the most recent tool result, if any."""

        return self._last_result

    def get_history(self) -> List[HistoryEntry]:
        """Return the raw history entries."""

        return list(self._history)

    def describe_history(self, limit: int = 25) -> List[Dict[str, Any]]:
        """Provide a serialisable view of recent history entries."""

        if limit <= 0:
            return []
        return [entry.describe() for entry in self._history[-limit:]]

    def reset_history(self) -> None:
        """Clear recorded tool invocations."""

        self._history.clear()
        self._last_result = None

    def describe(self) -> Dict[str, Any]:
        """Return metadata about the VM state."""

        return {
            "system_prompt": self.system_prompt,
            "history_length": len(self._history),
        }
