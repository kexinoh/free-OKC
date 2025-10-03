import copy

import pytest

pytest.importorskip("httpx")
from fastapi.testclient import TestClient

import okcvm.config as config_mod
from okcvm.config import MediaConfig, ModelEndpointConfig
from okcvm.api import main


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
            )


@pytest.fixture
def client():
    return TestClient(main.create_app())


def test_root_redirects_to_frontend(client):
    response = client.get("/", follow_redirects=False)
    assert response.status_code in {302, 307}
    assert response.headers["location"] == "/ui/"


def test_read_config_endpoint_returns_current_settings(client):
    image = ModelEndpointConfig(
        model="image-alpha",
        base_url="https://api.example.com/image",
        api_key="secret-image",
    )
    chat = ModelEndpointConfig(
        model="gpt-test",
        base_url="https://api.example.com/chat",
        api_key="secret-chat",
    )
    config_mod.configure(
        chat=chat,
        media=MediaConfig(
            image=image,
            speech=None,
            sound_effects=None,
            asr=None,
        ),
    )

    response = client.get("/api/config")
    payload = response.json()

    assert payload["chat"]["model"] == "gpt-test"
    assert payload["chat"]["base_url"] == "https://api.example.com/chat"
    assert payload["chat"]["api_key_present"] is True
    assert payload["image"]["model"] == "image-alpha"
    assert payload["image"]["api_key_present"] is True
    assert payload["speech"] is None
    assert payload["sound_effects"] is None
    assert payload["asr"] is None


def test_update_config_endpoint_accepts_trimmed_payload(client):
    response = client.post(
        "/api/config",
        json={
            "chat": {
                "model": "  gpt-4o-mini  ",
                "base_url": " https://chat.invalid/v1 ",
                "api_key": " sk-live ",
            },
            "image": {
                "model": "  painterly ",
                "base_url": " https://image.invalid/v1 ",
            },
        },
    )
    assert response.status_code == 200
    payload = response.json()

    assert payload["chat"]["model"] == "gpt-4o-mini"
    assert payload["chat"]["base_url"] == "https://chat.invalid/v1"
    assert payload["chat"]["api_key_present"] is True
    assert payload["image"]["model"] == "painterly"
    assert payload["image"]["base_url"] == "https://image.invalid/v1"

    updated = config_mod.get_config()
    assert updated.chat is not None
    assert updated.chat.model == "gpt-4o-mini"
    assert updated.media.image is not None
    assert updated.media.image.base_url == "https://image.invalid/v1"


def test_update_config_endpoint_reports_errors(monkeypatch, client):
    def boom(**kwargs):  # noqa: ANN001
        raise RuntimeError("bad config")

    monkeypatch.setattr(main, "configure", boom)

    response = client.post(
        "/api/config",
        json={"chat": {"model": "gpt", "base_url": "https://chat.invalid"}},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "bad config"


def test_session_endpoints_use_session_state(monkeypatch, client):
    boot = client.get("/api/session/boot")
    boot_payload = boot.json()
    assert "reply" in boot_payload
    assert "vm" in boot_payload
    assert boot_payload["vm"]["history_length"] >= 0

    captured = {}

    def fake_respond(message):  # noqa: ANN001
        captured["message"] = message
        return {
            "reply": "pong",
            "meta": {"model": "stub"},
            "web_preview": None,
            "ppt_slides": [],
            "vm_history": [],
        }

    monkeypatch.setattr(main.state, "respond", fake_respond)

    chat = client.post("/api/chat", json={"message": "ping"})
    assert chat.status_code == 200
    assert chat.json()["reply"] == "pong"
    assert captured["message"] == "ping"

    info = client.get("/api/session/info")
    assert info.status_code == 200
    assert "system_prompt" in info.json()


def test_delete_session_history_removes_workspace(client):
    boot = client.get("/api/session/boot")
    assert boot.status_code == 200

    previous_root = main.state.workspace.paths.internal_root
    assert previous_root.exists()

    response = client.delete("/api/session/history")
    assert response.status_code == 200
    payload = response.json()

    assert payload["history_cleared"] is True
    assert payload["workspace"]["removed"] is True
    assert payload["cleared_messages"] >= 1

    assert not previous_root.exists()
    assert main.state.workspace.paths.internal_root != previous_root
    assert len(main.state.vm.history) == 0


def test_workspace_snapshot_endpoints(client):
    boot = client.get("/api/session/boot")
    assert boot.status_code == 200

    snapshot_meta = client.get("/api/session/workspace/snapshots")
    assert snapshot_meta.status_code == 200
    payload = snapshot_meta.json()

    if not payload["enabled"]:
        pytest.skip("Git snapshots are disabled in this environment")

    workspace_path = main.state.workspace.resolve("report.md")
    workspace_path.write_text("draft v1", encoding="utf-8")

    created = client.post("/api/session/workspace/snapshots", json={"label": "Draft"})
    assert created.status_code == 200
    created_payload = created.json()
    latest = created_payload.get("latest_snapshot") or created_payload["snapshots"][0]["id"]

    workspace_path.write_text("draft v2", encoding="utf-8")
    updated = client.post("/api/session/workspace/snapshots", json={"label": "Revision"})
    assert updated.status_code == 200
    updated_payload = updated.json()
    second_snapshot = updated_payload.get("latest_snapshot")
    assert second_snapshot and second_snapshot != latest

    restored = client.post(
        "/api/session/workspace/restore",
        json={"snapshot_id": latest},
    )
    assert restored.status_code == 200
    assert workspace_path.read_text(encoding="utf-8") == "draft v1"
