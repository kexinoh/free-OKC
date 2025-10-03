import json

from okcvm.spec import ToolSpec
from okcvm.tools.todo import TodoReadTool, TodoWriteTool


def _todo_write_spec() -> ToolSpec:
    return ToolSpec(
        name="mshtools-todo_write",
        description="",
        parameters={
            "type": "object",
            "properties": {
                "todos": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "status": {"type": "string"},
                            "priority": {"type": "string"},
                            "content": {"type": "string"},
                        },
                        "required": ["status", "content"],
                        "additionalProperties": False,
                    },
                },
                "append": {"type": "boolean"},
                "clear": {"type": "boolean"},
            },
            "required": ["todos"],
            "additionalProperties": False,
        },
        returns={"type": "array", "items": {"type": "object"}},
    )


def _todo_read_spec() -> ToolSpec:
    return ToolSpec(
        name="mshtools-todo_read",
        description="",
        parameters={"type": "object", "properties": {}, "additionalProperties": False},
        returns={"type": "array", "items": {"type": "object"}},
    )


def test_todo_write_and_read(tmp_path, monkeypatch):
    storage = tmp_path / "todos.json"
    monkeypatch.setenv("OKCVM_TODO_PATH", str(storage))

    writer = TodoWriteTool(_todo_write_spec())
    reader = TodoReadTool(_todo_read_spec())

    todos = [
        {"status": "pending", "priority": "high", "content": "Implement tests"},
    ]
    result_write = writer.call(todos=todos)
    assert result_write.success

    result_read = reader.call()
    assert result_read.success
    payload = result_read.data
    assert isinstance(payload, list)
    assert payload[0]["content"] == "Implement tests"

    disk_data = json.loads(storage.read_text())
    assert disk_data[0]["status"] == "pending"
