"""File system oriented tool implementations."""

from __future__ import annotations

import base64
import mimetypes
from pathlib import Path
from typing import Optional

from .base import Tool, ToolError, ToolResult


def _ensure_absolute(path_str: str) -> Path:
    path = Path(path_str)
    if not path.is_absolute():
        raise ToolError("file_path must be absolute")
    return path


class ReadFileTool(Tool):
    name = "mshtools-read_file"

    def call(self, **kwargs) -> ToolResult:  # type: ignore[override]
        file_path = kwargs.get("file_path")
        if not file_path:
            raise ToolError("'file_path' is required")
        path = _ensure_absolute(file_path)
        if not path.exists():
            raise ToolError(f"File not found: {path}")

        offset = int(kwargs.get("offset", 0) or 0)
        limit = kwargs.get("limit")
        limit_int: Optional[int] = None if limit is None else int(limit)

        mime, _ = mimetypes.guess_type(path)
        if mime and mime.startswith("image/"):
            data = base64.b64encode(path.read_bytes()).decode("ascii")
            output = f"data:{mime};base64,{data}"
            return ToolResult(success=True, data={"mime": mime, "base64": data}, output=output)

        text = path.read_text(encoding="utf-8", errors="replace")
        if offset:
            text = "\n".join(text.splitlines()[offset:])
        if limit_int is not None:
            text = "\n".join(text.splitlines()[:limit_int])
        return ToolResult(success=True, data=text, output=text)


class WriteFileTool(Tool):
    name = "mshtools-write_file"

    def call(self, **kwargs) -> ToolResult:  # type: ignore[override]
        file_path = kwargs.get("file_path")
        content = kwargs.get("content")
        append = bool(kwargs.get("append", False))
        if not file_path or content is None:
            raise ToolError("'file_path' and 'content' are required")
        path = _ensure_absolute(file_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        mode = "a" if append else "w"
        with path.open(mode, encoding="utf-8") as handle:
            handle.write(content)
        return ToolResult(success=True, data={"path": str(path)}, output=str(path))


class EditFileTool(Tool):
    name = "mshtools-edit_file"

    def call(self, **kwargs) -> ToolResult:  # type: ignore[override]
        file_path = kwargs.get("file_path")
        old = kwargs.get("old_string")
        new = kwargs.get("new_string")
        replace_all = bool(kwargs.get("replace_all", False))
        if not file_path or old is None or new is None:
            raise ToolError("'file_path', 'old_string', and 'new_string' are required")
        if old == new:
            raise ToolError("'old_string' and 'new_string' must differ")
        path = _ensure_absolute(file_path)
        if not path.exists():
            raise ToolError(f"File not found: {path}")
        text = path.read_text(encoding="utf-8", errors="replace")
        count = text.count(old)
        if count == 0:
            raise ToolError("'old_string' not found in file")
        if count > 1 and not replace_all:
            raise ToolError("'old_string' is not unique; pass replace_all=True to replace all occurrences")
        if replace_all:
            updated = text.replace(old, new)
            replacements = count
        else:
            updated = text.replace(old, new, 1)
            replacements = 1
        path.write_text(updated, encoding="utf-8")
        return ToolResult(success=True, data={"replacements": replacements}, output=str(path))
