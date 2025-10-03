"""Tests for okcvm.server SessionState utilities and helpers."""

import pytest

pytest.importorskip("fastapi")

from okcvm.config import ModelEndpointConfig
from okcvm.server import (
    ConfigUpdatePayload,
    EndpointConfigPayload,
    SessionState,
    _build_media_config,
    _describe_endpoint,
)


def test_describe_endpoint_roundtrip_includes_masked_fields():
    """_describe_endpoint should expose model/base_url while masking secrets."""

    config = ModelEndpointConfig(
        model="demo-model",
        base_url="https://api.example.com/v1/demo",
        api_key="secret-key",
    )

    description = _describe_endpoint(config)

    assert description["model"] == "demo-model"
    assert description["base_url"] == "https://api.example.com/v1/demo"
    # api_key should not be returned directly, but api_key_present flag should exist
    assert description["api_key_present"] is True



def test_build_media_config_trims_and_ignores_incomplete_entries():
    """Only valid entries should be converted into ModelEndpointConfig instances."""

    payload = ConfigUpdatePayload(
        image=EndpointConfigPayload(
            model=" moonshot-image ",
            base_url=" https://img.example.com/v1 ",
            api_key="  sk-123  ",
        ),
        speech=EndpointConfigPayload(model="", base_url="", api_key=None),
    )

    media_config = _build_media_config(payload)

    assert media_config.image is not None
    assert media_config.image.model == "moonshot-image"
    assert media_config.image.base_url == "https://img.example.com/v1"
    assert media_config.image.api_key == "sk-123"
    assert media_config.speech is None



def test_session_state_boot_and_respond_flow():
    """Booting and responding should update history and return preview assets."""

    state = SessionState()
    state._rng.seed(42)

    boot_payload = state.boot()

    # Boot should reset history and seed it with a welcome message
    assert len(state.history) == 1
    assert state.history[0]["role"] == "assistant"
    assert "html" in boot_payload["web_preview"]

    history_length = len(state.history)

    response = state.respond("请帮我生成一个个人简历网页")

    assert len(state.history) == history_length + 2
    assert response["web_preview"]["html"].startswith("<!DOCTYPE html>")
    assert response["ppt_slides"]
    assert response["meta"]["model"]
