from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from ..config import ModelEndpointConfig


class EndpointConfigPayload(BaseModel):
    """Incoming configuration payload for a single model endpoint."""

    model: Optional[str] = Field(default=None, description="Model identifier")
    base_url: Optional[str] = Field(default=None, description="Endpoint base URL")
    api_key: Optional[str] = Field(default=None, description="Provider API key")
    supports_streaming: Optional[bool] = Field(
        default=None,
        description="Whether the endpoint supports server-sent event streaming.",
    )

    def to_model(self) -> ModelEndpointConfig | None:
        model = self.model.strip() if self.model is not None else None
        base_url = self.base_url.strip() if self.base_url is not None else None
        api_key = self.api_key.strip() if self.api_key is not None else None
        if not model or not base_url:
            return None
        return ModelEndpointConfig(
            model=model,
            base_url=base_url,
            api_key=api_key or None,
            supports_streaming=self.supports_streaming
            if self.supports_streaming is not None
            else True,
        )


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
    replace_last: bool = Field(
        default=False,
        description=(
            "When true, discard the most recent user/assistant exchange before processing "
            "this message. This allows regenerating a previous reply without duplicating "
            "conversation turns."
        ),
    )
    stream: bool = Field(
        default=True,
        description=(
            "When true the response is delivered as a server-sent event stream with "
            "incremental updates."
        ),
    )


class SnapshotCreatePayload(BaseModel):
    """Payload to manually snapshot the current workspace state."""

    label: Optional[str] = Field(
        default=None,
        description="Optional label describing the snapshot",
        max_length=200,
    )


class SnapshotRestorePayload(BaseModel):
    """Payload to restore the workspace to an earlier snapshot."""

    snapshot_id: Optional[str] = Field(
        default=None,
        description="Git commit identifier to restore",
    )
    branch: Optional[str] = Field(
        default=None,
        description="Workspace branch to switch to",
        max_length=200,
    )
    checkout: bool = Field(
        default=True,
        description="When true, update HEAD to the requested commit or branch.",
    )

    @model_validator(mode="after")
    def _ensure_target(cls, values: "SnapshotRestorePayload") -> "SnapshotRestorePayload":
        if not values.snapshot_id and not values.branch:
            raise ValueError("snapshot_id or branch must be provided")
        return values


class WorkspaceBranchPayload(BaseModel):
    """Payload to bind a workspace snapshot to a Git branch."""

    branch: str = Field(..., description="Workspace branch name", min_length=1, max_length=200)
    snapshot_id: Optional[str] = Field(
        default=None,
        description="Commit hash that the branch should reference",
    )
    checkout: bool = Field(
        default=True,
        description="When true, check out the branch after assignment.",
    )


class ConversationPayload(BaseModel):
    """Conversation tree payload exchanged with the frontend."""

    model_config = ConfigDict(extra="allow")

    id: str = Field(..., description="Conversation identifier")
    title: Optional[str] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    messages: Any = Field(default_factory=list)
    branches: Dict[str, Any] = Field(default_factory=dict)
    outputs: Dict[str, Any] = Field(default_factory=dict)
    workspace: Optional[Dict[str, Any]] = None
