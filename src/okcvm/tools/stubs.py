"""Stub implementations for tools that are not yet supported."""

from __future__ import annotations

from .base import Tool, ToolResult


class StubTool(Tool):
    """Simple tool that reports lack of implementation."""

    name = "stub"

    def __init__(self, spec, message: str):
        super().__init__(spec)
        self._message = message
        self.name = spec.name

    def call(self, **kwargs) -> ToolResult:  # type: ignore[override]
        return ToolResult(success=False, error=self._message)
