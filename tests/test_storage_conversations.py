import json
from datetime import datetime, timezone

import pytest

from okcvm.config import WorkspaceConfig, configure, reset_config
from okcvm.storage.conversations import ConversationStore, ConversationStoreConfig


@pytest.fixture
def conversation_store(tmp_path):
    workspace_dir = tmp_path / "workspace"
    workspace_dir.mkdir()
    configure(workspace=WorkspaceConfig(path=str(workspace_dir)))

    db_path = tmp_path / "conversations.db"
    store = ConversationStore(
        ConversationStoreConfig(url=f"sqlite:///{db_path}")
    )
    try:
        yield store, workspace_dir
    finally:
        store._engine.dispose()  # type: ignore[attr-defined]
        reset_config()


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def test_conversation_store_roundtrip(conversation_store):
    store, workspace_dir = conversation_store
    conversation_id = "conv-123"
    client_id = "client-abc"

    created_at = _now_iso()

    initial_payload = {
        "id": conversation_id,
        "title": "First conversation",
        "createdAt": created_at,
        "updatedAt": created_at,
        "messages": [],
        "branches": {},
        "outputs": {},
    }

    stored = store.save_conversation(client_id, initial_payload)
    assert stored["id"] == conversation_id

    fetched = store.get_conversation(client_id, conversation_id)
    assert fetched is not None
    assert fetched["id"] == conversation_id
    assert fetched["title"] == "First conversation"
    assert fetched.get("workspace") == initial_payload.get("workspace")

    listed = store.list_conversations(client_id)
    assert len(listed) == 1
    assert listed[0]["id"] == conversation_id

    workspace_root = workspace_dir / "sessions" / conversation_id
    workspace_root.mkdir(parents=True)
    (workspace_root / "notes.txt").write_text("hello", encoding="utf-8")

    session_id = "session-xyz"
    deployments_dir = workspace_dir / "deployments" / session_id
    deployments_dir.mkdir(parents=True)
    (deployments_dir / "meta.json").write_text(json.dumps({"ok": True}), encoding="utf-8")

    updated_at = _now_iso()
    updated_payload = {
        "id": conversation_id,
        "title": "Updated conversation",
        "createdAt": created_at,
        "updatedAt": updated_at,
        "messages": [
            {
                "id": "m1",
                "role": "user",
                "content": "Hello",
                "timestamp": created_at,
            }
        ],
        "branches": {
            "m1": {
                "activeIndex": 0,
                "versions": [
                    {
                        "id": "v1",
                        "messages": [
                            {
                                "id": "m1",
                                "role": "assistant",
                                "content": "Hi!",
                                "timestamp": created_at,
                            }
                        ],
                        "createdAt": created_at,
                    }
                ],
            }
        },
        "workspace": {
            "paths": {
                "internal_root": str(workspace_root),
                "mount": "/mnt/workspace",
                "session_id": session_id,
            },
            "git": {
                "commit": "abc1234",
                "is_dirty": False,
            },
        },
    }

    store.save_conversation(client_id, updated_payload)
    refreshed = store.get_conversation(client_id, conversation_id)
    assert refreshed is not None
    assert refreshed["title"] == "Updated conversation"
    assert refreshed["workspace"]["paths"]["internal_root"] == str(workspace_root)
    assert refreshed["workspace"]["git"]["commit"] == "abc1234"
    assert refreshed["workspace"]["git"]["is_dirty"] is False

    success, summary = store.delete_conversation(client_id, conversation_id)
    assert success is True
    assert summary["removed"] is True
    assert summary["path"] == str(workspace_root)
    assert not workspace_root.exists()
    assert summary.get("deployments_removed") == [str(deployments_dir.resolve())]

    assert store.get_conversation(client_id, conversation_id) is None
    assert store.list_conversations(client_id) == []
