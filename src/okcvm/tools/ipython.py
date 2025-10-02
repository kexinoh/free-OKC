"""Lightweight IPython-like execution environment."""

from __future__ import annotations

import contextlib
import io
import subprocess
import traceback
from typing import Dict, List

from .base import Tool, ToolResult


class IPythonTool(Tool):
    name = "mshtools-ipython"

    def __init__(self, spec):
        super().__init__(spec)
        self._globals: Dict[str, object] = {}

    def call(self, **kwargs) -> ToolResult:  # type: ignore[override]
        if kwargs.get("reset"):
            self._globals.clear()
            return ToolResult(success=True, output="Environment reset", data={"reset": True})

        code = kwargs.get("code")
        if not code:
            return ToolResult(success=False, error="'code' argument is required")

        shell_outputs: List[str] = []
        python_code_lines: List[str] = []
        for line in code.splitlines():
            stripped = line.strip()
            if stripped.startswith("!"):
                command = stripped[1:]
                import shlex
                completed = subprocess.run(
                    shlex.split(command),
                    capture_output=True,
                    text=True,
                )
                combined = (completed.stdout or "") + (completed.stderr or "")
                shell_outputs.append(combined.strip())
            else:
                python_code_lines.append(line)
        python_code = "\n".join(python_code_lines)

        stream = io.StringIO()
        error_text = None
        if python_code.strip():
            try:
                with contextlib.redirect_stdout(stream):
                    exec(python_code, self._globals, self._globals)
            except Exception as exc:  # pragma: no cover - error path
                error_text = "".join(traceback.format_exception(exc))
        output_parts = [part for part in [stream.getvalue().strip(), *shell_outputs] if part]
        output_text = "\n\n".join(output_parts).strip()
        success = error_text is None
        return ToolResult(success=success, output=output_text or None, data={
            "globals": list(self._globals.keys()),
        }, error=error_text)
