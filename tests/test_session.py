import json
from typing import Any, Dict

import pytest

from okcvm import session as session_module
from okcvm.config import WorkspaceConfig, configure, get_config


class DummyVM:
    def __init__(self, system_prompt: str, registry: Any) -> None:  # noqa: D401 - test stub
        self.system_prompt = system_prompt
        self.registry = registry
        self.history: list[Dict[str, Any]] = []
        self._response: Dict[str, Any] = {"reply": "", "tool_calls": []}

    def execute(self, message: str) -> Dict[str, Any]:
        self.history.append({"role": "user", "content": message})
        reply = self._response.get("reply", "")
        self.history.append({"role": "assistant", "content": reply})
        return self._response

    def describe_history(self, limit: int = 25):
        return self.history[-limit:]

    def discard_last_exchange(self) -> bool:
        if len(self.history) < 2:
            return False
        self.history = self.history[:-2]
        return True

    def record_history_entry(self, entry: Dict[str, Any]) -> Dict[str, Any]:
        self.history.append(entry)
        return entry

    def describe(self) -> Dict[str, Any]:
        return {"history_length": len(self.history)}


@pytest.fixture(autouse=True)
def restore_config_state():
    original = get_config()
    try:
        yield
    finally:
        configure(workspace=original.workspace.copy())


def test_session_collects_preview_from_non_terminal_tool(monkeypatch):
    monkeypatch.setattr(session_module, "VirtualMachine", DummyVM)

    configure(workspace=WorkspaceConfig(preview_base_url="https://preview.invalid"))
    state = session_module.SessionState()
    state.attach_client("test-client")

    deployment_payload = {
        "output": "Deployment complete. Site is ready.",
        "data": {
            "deployment_id": "761043",
            "preview_url": "/?s=761043&path=index.html",
            "deployment": {
                "id": "761043",
                "name": "Hello World",
                "preview_url": "/?s=761043&path=index.html",
            },
        },
    }
    write_payload = {
        "output": "Wrote file /index.html",
        "data": {"path": "/workspace/index.html"},
    }

    state.vm._response = {
        "reply": "done",
        "tool_calls": [
            {"tool_name": "mshtools-deploy_website", "tool_output": json.dumps(deployment_payload)},
            {"tool_name": "mshtools-files_write", "tool_output": json.dumps(write_payload)},
        ],
    }

    result = state.respond("create site")

    preview = result["web_preview"]
    assert preview is not None
    assert preview["deployment_id"] == "761043"
    assert preview["title"] == "Hello World"
    assert preview["url"].startswith("https://preview.invalid/")

    assert result["artifacts"], "expected web artifacts to be returned"
    assert any(artifact["url"] == preview["url"] for artifact in result["artifacts"])

    assert result["ppt_slides"] == []
    assert result["meta"]["summary"].startswith("Wrote file")
