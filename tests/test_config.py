import copy
from pathlib import Path

import pytest

pytest.importorskip("yaml")

import okcvm.config as config_mod
from okcvm.config import MediaConfig, ModelEndpointConfig, WorkspaceConfig


@pytest.fixture(autouse=True)
def restore_config_state():
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


def test_model_endpoint_config_from_env_with_partial_values():
    env = {
        "OKCVM_IMAGE_MODEL": "stable-pixel",
        "OKCVM_IMAGE_BASE_URL": "https://image.api",
    }
    cfg = ModelEndpointConfig.from_env("OKCVM_IMAGE", env)
    assert cfg is not None
    assert cfg.model == "stable-pixel"
    assert cfg.base_url == "https://image.api"
    assert cfg.api_key is None

    missing = ModelEndpointConfig.from_env("OKCVM_SPEECH", env)
    assert missing is None


def test_model_endpoint_config_describe_hides_api_key():
    cfg = ModelEndpointConfig(
        model="speech-pro",
        base_url="https://speech.api",
        api_key="top-secret",
    )
    description = cfg.describe()
    assert description == {
        "model": "speech-pro",
        "base_url": "https://speech.api",
        "api_key_present": True,
    }


def test_configure_updates_media_without_affecting_chat():
    initial_chat = ModelEndpointConfig(
        model="gpt-initial",
        base_url="https://chat.initial",
        api_key="initial",
    )
    config_mod.configure(chat=initial_chat)

    media = MediaConfig(
        image=ModelEndpointConfig(
            model="img-one",
            base_url="https://image.one",
            api_key="image-key",
        ),
    )
    config_mod.configure(media=media)

    cfg = config_mod.get_config()
    assert cfg.chat is not None
    assert cfg.chat.model == "gpt-initial"
    assert cfg.media.image is not None
    assert cfg.media.image.model == "img-one"


def test_configure_updates_workspace(tmp_path: Path):
    workspace_cfg = WorkspaceConfig(path=str(tmp_path), confirm_on_start=False)
    config_mod.configure(workspace=workspace_cfg)

    cfg = config_mod.get_config()
    assert cfg.workspace.confirm_on_start is False
    assert cfg.workspace.resolve_path() == tmp_path.resolve()


def test_load_config_from_yaml_supports_env_keys(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("CHAT_API_KEY", "sk-chat")
    monkeypatch.setenv("SPEECH_API_KEY", "sk-speech")

    payload = {
        "chat": {
            "model": "gpt-yaml",
            "base_url": "https://chat.yaml",
            "api_key_env": "CHAT_API_KEY",
        },
        "media": {
            "image": {
                "model": "image-yaml",
                "base_url": "https://image.yaml",
                "api_key": "inline-image",
            },
            "speech": {
                "model": "speech-yaml",
                "base_url": "https://speech.yaml",
                "api_key_env": "SPEECH_API_KEY",
            },
        },
    }

    config_file = tmp_path / "okcvm.yaml"
    config_file.write_text(config_mod.yaml.safe_dump(payload), encoding="utf-8")

    config_mod.load_config_from_yaml(config_file)
    cfg = config_mod.get_config()

    assert cfg.chat is not None
    assert cfg.chat.api_key == "sk-chat"
    assert cfg.media.image is not None
    assert cfg.media.image.api_key == "inline-image"
    assert cfg.media.speech is not None
    assert cfg.media.speech.api_key == "sk-speech"


def test_load_config_from_yaml_missing_file_is_noop(tmp_path: Path, capsys):
    config_mod.load_config_from_yaml(tmp_path / "missing.yaml")
    captured = capsys.readouterr().out
    assert "Config file not found" in captured
