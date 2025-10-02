"""Implementations of the mshtools todo tools."""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import List, Sequence

from .base import Tool, ToolError, ToolResult


@dataclass
class TodoItem:
    status: str
    priority: str | None
    content: str

    @classmethod
    def from_mapping(cls, mapping: dict) -> "TodoItem":
        try:
            status = mapping["status"]
            content = mapping["content"]
        except KeyError as exc:  # pragma: no cover - defensive guard
            raise ToolError(f"Missing required todo field: {exc.args[0]}") from exc
        priority = mapping.get("priority")
        return cls(status=status, priority=priority, content=content)

    def to_dict(self) -> dict:
        return asdict(self)


def _storage_path() -> Path:
    override = os.getenv("OKCVM_TODO_PATH")
    if override:
        return Path(override)
    root = Path.home() / ".okcvm"
    root.mkdir(parents=True, exist_ok=True)
    return root / "todo.json"


def _load_items() -> List[TodoItem]:
    path = _storage_path()
    if not path.exists():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return [TodoItem.from_mapping(item) for item in data]


def _dump_items(items: Sequence[TodoItem]) -> None:
    path = _storage_path()
    payload = [item.to_dict() for item in items]
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")


class TodoReadTool(Tool):
    name = "mshtools-todo_read"

    def call(self, **kwargs) -> ToolResult:  # type: ignore[override]
        items = _load_items()
        output = json.dumps([item.to_dict() for item in items], indent=2, ensure_ascii=False)
        return ToolResult(success=True, data=[item.to_dict() for item in items], output=output)


class TodoWriteTool(Tool):
    name = "mshtools-todo_write"

    def call(self, **kwargs) -> ToolResult:  # type: ignore[override]
        if kwargs.get("clear"):
            _dump_items([])
            return ToolResult(success=True, data=[], output="[]")

        todos = kwargs.get("todos")
        append = kwargs.get("append", False)
        if todos is None:
            raise ToolError("'todos' parameter is required when not clearing the list")
        if not isinstance(todos, list):
            raise ToolError("'todos' must be a list of todo dictionaries")

        new_items = [TodoItem.from_mapping(item) for item in todos]
        if append:
            items = _load_items() + new_items
        else:
            items = new_items
        _dump_items(items)
        output = json.dumps([item.to_dict() for item in items], indent=2, ensure_ascii=False)
        return ToolResult(success=True, data=[item.to_dict() for item in items], output=output)
