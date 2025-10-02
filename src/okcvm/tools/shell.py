"""Shell tool implementation."""

from __future__ import annotations

import subprocess
from typing import Optional

from .base import Tool, ToolResult


class ShellTool(Tool):
    name = "mshtools-shell"

    def call(self, **kwargs) -> ToolResult:  # type: ignore[override]
        command = kwargs.get("command")
        if not command:
            raise ValueError("'command' argument is required")
        timeout: Optional[float] = kwargs.get("timeout")
        import shlex
        completed = subprocess.run(
            shlex.split(command),
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        combined = (completed.stdout or "") + (completed.stderr or "")
        success = completed.returncode == 0
        return ToolResult(success=success, output=combined, data={
            "returncode": completed.returncode,
            "stdout": completed.stdout,
            "stderr": completed.stderr,
        }, error=None if success else combined or "Command failed")
