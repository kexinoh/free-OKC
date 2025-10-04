import copy
import json

import pytest

pytest.importorskip("httpx")
from fastapi.testclient import TestClient

import okcvm.config as config_mod
from okcvm.config import MediaConfig, ModelEndpointConfig, WorkspaceConfig
from okcvm.api import main


TEST_CLIENT_ID = "test-client"


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


@pytest.fixture
def client(tmp_path):
    config_mod.configure(workspace=WorkspaceConfig(path=str(tmp_path)))
    main.session_store = main.SessionStore()
    main.session_store.reset()
    main.session_store.get(TEST_CLIENT_ID)
    return TestClient(
        main.create_app(),
        headers={"x-okc-client-id": TEST_CLIENT_ID},
    )


def test_root_redirects_to_frontend(client):
    response = client.get("/", follow_redirects=False)
    assert response.status_code in {302, 307}
    assert response.headers["location"] == "/ui/"


def test_deployment_assets_accessible_via_query_and_direct_paths(client):
    deployment_id = "123456"
    session = main.session_store.get(TEST_CLIENT_ID)
    deployments_root = session.workspace.deployments_root
    site_dir = deployments_root / deployment_id
    site_dir.mkdir(parents=True, exist_ok=True)
    (site_dir / "index.html").write_text(
        "<html><body><h1>Preview</h1><link rel=\"stylesheet\" href=\"styles.css\"></body></html>",
        encoding="utf-8",
    )
    (site_dir / "styles.css").write_text("body { background: #fff; }", encoding="utf-8")

    via_query = client.get("/", params={"s": deployment_id, "path": "index.html"})
    assert via_query.status_code == 200
    assert "<h1>Preview</h1>" in via_query.text

    direct_html = client.get(f"/{deployment_id}/index.html")
    assert direct_html.status_code == 200
    assert direct_html.headers["content-type"].startswith("text/html")
    assert "<h1>Preview</h1>" in direct_html.text

    direct_asset = client.get(f"/{deployment_id}/styles.css")
    assert direct_asset.status_code == 200
    assert direct_asset.headers["content-type"].startswith("text/css")
    assert "background" in direct_asset.text

    trailing_slash = client.get(f"/{deployment_id}/")
    assert trailing_slash.status_code == 200
    assert "<h1>Preview</h1>" in trailing_slash.text


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

    def fake_respond(message, **kwargs):  # noqa: ANN001
        captured["message"] = message
        return {
            "reply": "pong",
            "meta": {"model": "stub"},
            "web_preview": None,
            "ppt_slides": [],
            "vm_history": [],
        }

    session = main.session_store.get(TEST_CLIENT_ID)
    monkeypatch.setattr(session, "respond", fake_respond)

    chat = client.post("/api/chat", json={"message": "ping"})
    assert chat.status_code == 200
    assert chat.json()["reply"] == "pong"
    assert captured["message"] == "ping"

    info = client.get("/api/session/info")
    assert info.status_code == 200
    assert "system_prompt" in info.json()


def test_chat_endpoint_allows_replacing_last_exchange(monkeypatch, client):
    client.get("/api/session/boot")

    vm = main.state.vm

    def fake_execute(message):  # noqa: ANN001
        vm.record_history_entry({"role": "user", "content": message})
        reply = f"echo:{message}"
        vm.record_history_entry({"role": "assistant", "content": reply})
        return {"reply": reply, "tool_calls": []}

    monkeypatch.setattr(vm, "execute", fake_execute)

    first = client.post("/api/chat", json={"message": "hello"})
    assert first.status_code == 200
    history_after_first = first.json()["vm_history"]
    assert isinstance(history_after_first, list)
    assert len(history_after_first) >= 2

    second = client.post("/api/chat", json={"message": "hello", "replace_last": True})
    assert second.status_code == 200
    history_after_second = second.json()["vm_history"]

    assert len(history_after_second) == len(history_after_first)
    assert history_after_second[-2]["role"] == "user"
    assert history_after_second[-2]["content"] == "hello"
    assert history_after_second[-1]["role"] == "assistant"
    assert history_after_second[-1]["content"].startswith("echo:")
    
    
def test_boot_does_not_reset_existing_workspace(client):
    first_boot = client.get("/api/session/boot")
    assert first_boot.status_code == 200

    session = main.session_store.get(TEST_CLIENT_ID)
    workspace = session.workspace
    workspace_root = workspace.paths.internal_root
    sentinel = workspace.paths.internal_output / "sentinel.txt"
    sentinel.write_text("preserve", encoding="utf-8")

    second_boot = client.get("/api/session/boot")
    assert second_boot.status_code == 200

    assert sentinel.exists()
    assert session.workspace.paths.internal_root == workspace_root


def test_delete_session_history_removes_workspace(client):
    boot = client.get("/api/session/boot")
    assert boot.status_code == 200

    session = main.session_store.get(TEST_CLIENT_ID)
    previous_root = session.workspace.paths.internal_root
    assert previous_root.exists()

    deployments_root = session.workspace.deployments_root
    deployment_dir = deployments_root / "999001"
    deployment_dir.mkdir(parents=True, exist_ok=True)
    (deployment_dir / "deployment.json").write_text(
        json.dumps({"id": "999001", "session_id": session.workspace.session_id}),
        encoding="utf-8",
    )
    index_path = deployments_root / "manifest.json"
    index_path.write_text(json.dumps([{"id": "999001"}]), encoding="utf-8")

    response = client.delete("/api/session/history")
    assert response.status_code == 200
    payload = response.json()

    assert payload["history_cleared"] is True
    assert payload["workspace"]["removed"] is True
    assert payload["cleared_messages"] >= 1

    assert "999001" in payload["workspace"].get("deployments", {}).get("removed_ids", [])

    assert not previous_root.exists()
    assert session.workspace.paths.internal_root != previous_root
    assert len(session.vm.history) == 0


def test_boot_preserves_existing_deployments(client):
    deployment_id = "777777"
    session = main.session_store.get(TEST_CLIENT_ID)
    workspace = session.workspace
    deployments_root = workspace.deployments_root
    site_dir = deployments_root / deployment_id
    site_dir.mkdir(parents=True, exist_ok=True)
    (site_dir / "index.html").write_text("<html><body>Persist</body></html>", encoding="utf-8")
    (site_dir / "deployment.json").write_text(
        json.dumps({"id": deployment_id, "session_id": workspace.session_id}),
        encoding="utf-8",
    )
    index_path = deployments_root / "manifest.json"
    index_path.write_text(json.dumps([{"id": deployment_id}]), encoding="utf-8")

    before = client.get(f"/{deployment_id}/index.html")
    assert before.status_code == 200

    session.boot()

    after = client.get(f"/{deployment_id}/index.html")
    assert after.status_code == 200

def test_workspace_snapshot_endpoints(client):
    boot = client.get("/api/session/boot")
    assert boot.status_code == 200

    snapshot_meta = client.get("/api/session/workspace/snapshots")
    assert snapshot_meta.status_code == 200
    payload = snapshot_meta.json()

    if not payload["enabled"]:
        pytest.skip("Git snapshots are disabled in this environment")

    session = main.session_store.get(TEST_CLIENT_ID)
    workspace_path = session.workspace.resolve("report.md")
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
