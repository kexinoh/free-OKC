import json

from okcvm.spec import ToolSpec
from okcvm.tools.todo import TodoReadTool, TodoWriteTool


def test_todo_write_and_read(tmp_path, monkeypatch):
    storage = tmp_path / "todos.json"
    monkeypatch.setenv("OKCVM_TODO_PATH", str(storage))

    spec = ToolSpec(name="mshtools-todo_write", description="")
    writer = TodoWriteTool(spec)
    spec_read = ToolSpec(name="mshtools-todo_read", description="")
    reader = TodoReadTool(spec_read)

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
