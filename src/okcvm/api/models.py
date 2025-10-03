from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

from ..config import MediaConfig, ModelEndpointConfig


class EndpointConfigPayload(BaseModel):
    """Incoming configuration payload for a single model endpoint."""

    model: Optional[str] = Field(default=None, description="Model identifier")
    base_url: Optional[str] = Field(default=None, description="Endpoint base URL")
    api_key: Optional[str] = Field(default=None, description="Provider API key")

    def to_model(self) -> ModelEndpointConfig | None:
        model = self.model.strip() if self.model is not None else None
        base_url = self.base_url.strip() if self.base_url is not None else None
        api_key = self.api_key.strip() if self.api_key is not None else None
        if not model or not base_url:
            return None
        return ModelEndpointConfig(model=model, base_url=base_url, api_key=api_key or None)


class ConfigUpdatePayload(BaseModel):
    """Full configuration update payload."""

    chat: Optional[EndpointConfigPayload] = None
    image: Optional[EndpointConfigPayload] = None
    speech: Optional[EndpointConfigPayload] = None
    sound_effects: Optional[EndpointConfigPayload] = None
    asr: Optional[EndpointConfigPayload] = None


class ChatRequest(BaseModel):
    """Request model for the chat endpoint."""

    message: str = Field(..., description="User utterance to process")


class SnapshotCreatePayload(BaseModel):
    """Payload to manually snapshot the current workspace state."""

    label: Optional[str] = Field(
        default=None,
        description="Optional label describing the snapshot",
        max_length=200,
    )


class SnapshotRestorePayload(BaseModel):
    """Payload to restore the workspace to an earlier snapshot."""

    snapshot_id: str = Field(..., description="Git commit identifier to restore")


def build_media_config(payload: ConfigUpdatePayload) -> MediaConfig:
    """Helper to build MediaConfig from a payload."""
    return MediaConfig(
        image=payload.image.to_model() if payload.image else None,
        speech=payload.speech.to_model() if payload.speech else None,
        sound_effects=payload.sound_effects.to_model() if payload.sound_effects else None,
        asr=payload.asr.to_model() if payload.asr else None,
    )
