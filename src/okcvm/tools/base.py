"""Base classes shared by OKCVM tool implementations."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional

from ..spec import ToolSpec


class ToolError(RuntimeError):
    """Raised when a tool cannot complete its task."""


@dataclass
class ToolResult:
    """Standardized container for tool call results."""

    success: bool
    output: Optional[str] = None
    data: Any | None = None
    error: Optional[str] = None

    def unwrap(self) -> Any:
        """Return ``data`` when successful or raise an error otherwise."""

        if not self.success:
            raise ToolError(self.error or "Tool execution failed")
        return self.data


class Tool:
    """Abstract base class for OKCVM tools."""

    name: str
    requires_workspace = False

    def __init__(self, spec: ToolSpec):
        self.spec = spec

    def call(self, **kwargs: Any) -> ToolResult:  # pragma: no cover - override hook
        raise NotImplementedError

    def describe(self) -> Dict[str, Any]:
        """Return metadata about the tool suitable for serialization."""

        return {
            "name": self.spec.name,
            "description": self.spec.description,
            "parameters": self.spec.parameters,
            "returns": self.spec.returns,
            "implementation": self.__class__.__name__,
        }
