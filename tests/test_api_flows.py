"""High level integration flows covering the public FastAPI endpoints.

These tests intentionally drive the HTTP API from start to finish to assert
that the orchestrator behaves correctly across multiple requests.  The LLM
interaction is replaced with a deterministic stub so that the behaviour is
stable across runs while still exercising the request/response lifecycle of
the application.
"""

from __future__ import annotations

import copy
from types import SimpleNamespace
from typing import Dict, Iterable, Optional

import pytest

pytest.importorskip("httpx")
from fastapi.testclient import TestClient

import okcvm.config as config_mod
from okcvm.api import main as api_main
from okcvm.config import WorkspaceConfig
from okcvm.constants import WELCOME_MESSAGE


TEST_CLIENT_ID = "long-cycle-client"


@pytest.fixture(autouse=True)
def restore_config_state():
    """Ensure global configuration is restored after each test."""

    original = config_mod.get_config()
    try:
        yield
    finally:
        with config_mod._config_lock:  # type: ignore[attr-defined]
            config_mod._config = config_mod.AppConfig(  # type: ignore[attr-defined]
                chat=copy.deepcopy(original.chat),
                media=copy.deepcopy(original.media),
                workspace=original.workspace.copy(),
            )


class _StubVirtualMachine:
    """Deterministic VM used to stabilise API level tests."""

    def __init__(self, system_prompt: str, registry):  # noqa: D401 - test stub
        self.system_prompt = system_prompt
        self.registry = registry
        self.history: list[Dict[str, str]] = []
        self._counter = 0

    def _next_id(self) -> str:
        self._counter += 1
        return f"stub-{self._counter:04d}"

    def execute(self, message: str) -> Dict[str, object]:
        user_entry = {"role": "user", "content": message, "id": self._next_id()}
        reply_text = f"Stub response: {message}"
        assistant_entry = {
            "role": "assistant",
            "content": reply_text,
            "id": self._next_id(),
        }
        self.history.extend([user_entry, assistant_entry])
        return {"reply": reply_text, "tool_calls": []}

    def describe(self) -> Dict[str, object]:
        return {"history_length": len(self.history)}

    def describe_history(self, limit: int = 25) -> Iterable[Dict[str, object]]:
        return [dict(entry) for entry in self.history[-limit:]]

    def discard_last_exchange(self) -> bool:
        removed_user = False
        removed_assistant = False
        while self.history and (not removed_user or not removed_assistant):
            entry = self.history.pop()
            if entry.get("role") == "assistant" and not removed_assistant:
                removed_assistant = True
            elif entry.get("role") == "user" and not removed_user:
                removed_user = True
        return removed_user or removed_assistant

    def record_history_entry(self, entry: Dict[str, object]) -> Dict[str, object]:
        stored = dict(entry)
        stored.setdefault("id", self._next_id())
        self.history.append(stored)
        return stored

    def get_history_entry(self, entry_id: str) -> Optional[Dict[str, object]]:
        for item in reversed(self.history):
            if item.get("id") == entry_id:
                return dict(item)
        return None


@pytest.fixture
def client(tmp_path, monkeypatch):
    """Create a FastAPI test client backed by the stub virtual machine."""

    from okcvm import session as session_module

    monkeypatch.setattr(session_module, "VirtualMachine", _StubVirtualMachine)

    config_mod.configure(workspace=WorkspaceConfig(path=str(tmp_path)))
    api_main.session_store = api_main.SessionStore()
    dummy_state = SimpleNamespace(
        set=lambda session: None,
        clear=lambda: None,
        reset=lambda: None,
    )
    monkeypatch.setattr(api_main, "state", dummy_state, raising=False)
    api_main.session_store.reset()
    api_main.session_store.get(TEST_CLIENT_ID)
    return TestClient(
        api_main.create_app(),
        headers={"x-okc-client-id": TEST_CLIENT_ID},
    )


def test_session_flow_boot_chat_history_and_cleanup(client):
    """Drive a full session lifecycle via the HTTP API."""

    boot_response = client.get("/api/session/boot")
    assert boot_response.status_code == 200
    boot_payload = boot_response.json()
    assert boot_payload["reply"] == WELCOME_MESSAGE
    assert boot_payload["vm"]["history_length"] == 1

    chat_response = client.post(
        "/api/chat",
        json={"message": "生成一个静态网页", "replace_last": False},
    )
    assert chat_response.status_code == 200
    chat_payload = chat_response.json()
    assert chat_payload["reply"] == "Stub response: 生成一个静态网页"

    history = chat_payload["vm_history"]
    assert [entry["role"] for entry in history] == ["assistant", "user", "assistant"]

    info_response = client.get("/api/session/info")
    assert info_response.status_code == 200
    assert info_response.json()["history_length"] == 3

    last_entry_id = history[-1]["id"]
    entry_response = client.get(f"/api/session/history/{last_entry_id}")
    assert entry_response.status_code == 200
    assert entry_response.json()["content"] == "Stub response: 生成一个静态网页"

    delete_response = client.delete("/api/session/history")
    assert delete_response.status_code == 200
    delete_payload = delete_response.json()
    assert delete_payload["history_cleared"] is True
    assert delete_payload["cleared_messages"] == 3
    assert delete_payload["vm"]["history_length"] == 0

    post_cleanup_info = client.get("/api/session/info")
    assert post_cleanup_info.status_code == 200
    assert post_cleanup_info.json()["history_length"] == 0


def test_session_flow_supports_replace_last_via_api(client):
    """Verify replace_last regenerations through the public API."""

    client.get("/api/session/boot")

    first = client.post(
        "/api/chat",
        json={"message": "第一次回复", "replace_last": False},
    )
    assert first.status_code == 200
    first_history = first.json()["vm_history"]
    assert first_history[-1]["content"] == "Stub response: 第一次回复"

    regen = client.post(
        "/api/chat",
        json={"message": "重新生成第二次", "replace_last": True},
    )
    assert regen.status_code == 200
    regen_payload = regen.json()
    assert regen_payload["reply"] == "Stub response: 重新生成第二次"

    regen_history = regen_payload["vm_history"]
    assert [entry["content"] for entry in regen_history[-2:]] == [
        "重新生成第二次",
        "Stub response: 重新生成第二次",
    ]
