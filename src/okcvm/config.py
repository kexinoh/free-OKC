"""Runtime configuration helpers for OKCVM tools.

This module keeps track of the model endpoints that the orchestrator should
use.  It deliberately focuses on a very small set of fields (``model``,
``base_url`` and ``api_key``) to make it easy to plug in real inference
providers.  The configuration can be loaded from environment variables, YAML
files or updated dynamically at runtime through the FastAPI endpoints.

The previous implementation mixed two different configuration systems which
made it difficult to reason about the active values and to integrate with real
services.  The module now exposes a single ``Config``/``AppConfig`` dataclass
backed by a thread-safe global state, ensuring that the server always works
with the latest credentials.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
import copy
import os
import threading
from typing import Mapping, Optional

import yaml

from .logging_utils import get_logger


logger = get_logger(__name__)

def _parse_bool(value: object, *, default: bool = True) -> bool:
    """Parse ``value`` into a boolean flag."""

    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalised = value.strip().lower()
        if normalised in {"1", "true", "yes", "on"}:
            return True
        if normalised in {"0", "false", "no", "off"}:
            return False
    return default


@dataclass(slots=True)
class ModelEndpointConfig:
    """Configuration for a single model endpoint."""

    model: str
    base_url: str
    api_key: Optional[str] = None
    supports_streaming: bool = True

    @classmethod
    def from_env(
        cls,
        prefix: str,
        env: Mapping[str, str] | None = None,
    ) -> "ModelEndpointConfig | None":
        """Create an instance from ``<PREFIX>_MODEL`` style variables.

        Parameters
        ----------
        prefix:
            Prefix to use when looking up the environment variables.
        env:
            Optional mapping used for lookups.  Defaults to ``os.environ``.
        """

        env_mapping = env or os.environ
        model = env_mapping.get(f"{prefix}_MODEL")
        base_url = env_mapping.get(f"{prefix}_BASE_URL")
        api_key = env_mapping.get(f"{prefix}_API_KEY")
        supports_streaming_raw = env_mapping.get(f"{prefix}_SUPPORTS_STREAMING")
        if model and base_url:
            return cls(
                model=model,
                base_url=base_url,
                api_key=api_key,
                supports_streaming=_parse_bool(
                    supports_streaming_raw,
                    default=True,
                ),
            )
        return None

    def describe(self) -> dict:
        """Return a serialisable view without leaking the API key."""

        description = {
            "model": self.model,
            "base_url": self.base_url,
            "supports_streaming": self.supports_streaming,
        }
        if self.api_key:
            description["api_key_present"] = True
        return description


@dataclass(slots=True)
class MediaConfig:
    """Configuration container for media-related tools."""

    image: ModelEndpointConfig | None = None
    speech: ModelEndpointConfig | None = None
    sound_effects: ModelEndpointConfig | None = None
    asr: ModelEndpointConfig | None = None

    def for_service(self, service: str) -> ModelEndpointConfig | None:
        """Return the configuration entry for ``service`` if present."""

        return getattr(self, service, None)


@dataclass(slots=True)
class WorkspaceConfig:
    """Configuration for the on-disk workspace sandbox."""

    path: Optional[str] = None
    confirm_on_start: bool = True
    preview_base_url: Optional[str] = None
    _config_dir: Optional[Path] = None

    def copy(self) -> "WorkspaceConfig":
        return WorkspaceConfig(
            path=self.path,
            confirm_on_start=self.confirm_on_start,
            preview_base_url=self.preview_base_url,
            _config_dir=self._config_dir,
        )

    def resolve_path(self, *, cwd: Optional[Path] = None) -> Path:
        """Resolve the workspace directory to an absolute :class:`Path`."""

        base_path = cwd or self._config_dir or Path.cwd()
        candidate = Path(self.path).expanduser() if self.path else Path("workspace")
        if not candidate.is_absolute():
            candidate = (base_path / candidate).resolve()
        else:
            candidate = candidate.resolve()
        return candidate

    def resolve_and_prepare(self, *, cwd: Optional[Path] = None) -> Path:
        """Resolve and ensure the workspace directory exists on disk."""

        resolved = self.resolve_path(cwd=cwd)
        resolved.mkdir(parents=True, exist_ok=True)
        return resolved


@dataclass(slots=True)
class Config:
    """Top-level runtime configuration shared by the whole application."""

    chat: Optional[ModelEndpointConfig] = None
    media: MediaConfig = field(default_factory=MediaConfig)
    workspace: WorkspaceConfig = field(default_factory=WorkspaceConfig)

    def copy(self) -> "Config":
        """Return a deep copy of the configuration instance."""

        return Config(
            chat=copy.deepcopy(self.chat),
            media=MediaConfig(
                image=copy.deepcopy(self.media.image),
                speech=copy.deepcopy(self.media.speech),
                sound_effects=copy.deepcopy(self.media.sound_effects),
                asr=copy.deepcopy(self.media.asr),
            ),
            workspace=self.workspace.copy(),
        )


# Backwards compatibility alias – older code imported ``AppConfig`` directly.
AppConfig = Config


def _load_media_from_env(env: Mapping[str, str] | None = None) -> MediaConfig:
    env_mapping = env or os.environ
    return MediaConfig(
        image=ModelEndpointConfig.from_env("OKCVM_IMAGE", env_mapping),
        speech=ModelEndpointConfig.from_env("OKCVM_SPEECH", env_mapping),
        sound_effects=ModelEndpointConfig.from_env("OKCVM_SOUND_EFFECTS", env_mapping),
        asr=ModelEndpointConfig.from_env("OKCVM_ASR", env_mapping),
    )


def _load_chat_from_env(env: Mapping[str, str] | None = None) -> ModelEndpointConfig | None:
    env_mapping = env or os.environ
    return ModelEndpointConfig.from_env("OKCVM_CHAT", env_mapping)


_config_lock = threading.Lock()
_config: Config = Config(
    chat=_load_chat_from_env(),
    media=_load_media_from_env(),
)


def configure(
    *,
    chat: Optional[ModelEndpointConfig] = None,
    media: Optional[MediaConfig] = None,
    workspace: Optional[WorkspaceConfig] = None,
) -> None:
    """Update the process-wide configuration."""

    with _config_lock:
        if chat is not None:
            _config.chat = copy.deepcopy(chat)
        if media is not None:
            _config.media = MediaConfig(
                image=copy.deepcopy(media.image),
                speech=copy.deepcopy(media.speech),
                sound_effects=copy.deepcopy(media.sound_effects),
                asr=copy.deepcopy(media.asr),
            )
        if workspace is not None:
            _config.workspace = workspace.copy()
    logger.info(
        "Configuration updated (chat=%s media=%s workspace=%s)",
        chat is not None,
        media is not None,
        workspace is not None,
    )


def get_config() -> Config:
    """Return a copy of the active configuration."""

    with _config_lock:
        return _config.copy()


def reset_config(env: Mapping[str, str] | None = None) -> None:
    """Reset the configuration based on environment variables (tests)."""

    global _config
    with _config_lock:
        _config = Config(
            chat=_load_chat_from_env(env),
            media=_load_media_from_env(env),
            workspace=WorkspaceConfig(),
        )


def load_config_from_yaml(path: Path) -> None:
    """Loads configuration from a YAML file and applies it."""
    if not path.exists():
        message = f"Config file not found: {path}"
        logger.warning(message)
        print(message)
        return

    logger.info("Loading configuration from file: %s", path)
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    if not data:
        logger.warning("Config file is empty: %s", path)
        return

    chat_config = data.get("chat")
    media_data = data.get("media")
    workspace_data = data.get("workspace")

    with _config_lock:
        current = _config.copy()

        _config.chat = _merge_endpoint_config(
            current.chat,
            chat_config if isinstance(chat_config, Mapping) else None,
            env_prefix="OKCVM_CHAT",
        )

        media_mapping = media_data if isinstance(media_data, Mapping) else {}
        _config.media = MediaConfig(
            image=_merge_endpoint_config(
                current.media.image,
                media_mapping.get("image") if isinstance(media_mapping.get("image"), Mapping) else None,
                env_prefix="OKCVM_IMAGE",
            ),
            speech=_merge_endpoint_config(
                current.media.speech,
                media_mapping.get("speech") if isinstance(media_mapping.get("speech"), Mapping) else None,
                env_prefix="OKCVM_SPEECH",
            ),
            sound_effects=_merge_endpoint_config(
                current.media.sound_effects,
                media_mapping.get("sound_effects") if isinstance(media_mapping.get("sound_effects"), Mapping) else None,
                env_prefix="OKCVM_SOUND_EFFECTS",
            ),
            asr=_merge_endpoint_config(
                current.media.asr,
                media_mapping.get("asr") if isinstance(media_mapping.get("asr"), Mapping) else None,
                env_prefix="OKCVM_ASR",
            ),
        )

        _config.workspace = _parse_workspace(workspace_data, config_dir=path.parent)

    logger.info("Configuration loaded successfully from YAML: %s", path)


def _merge_endpoint_config(
    existing: ModelEndpointConfig | None,
    yaml_data: Mapping[str, object] | None,
    *,
    env_prefix: str,
) -> ModelEndpointConfig | None:
    """Merge YAML and environment values while keeping existing overrides."""

    yaml_mapping = yaml_data if isinstance(yaml_data, Mapping) else {}

    env_model = os.environ.get(f"{env_prefix}_MODEL")
    env_base_url = os.environ.get(f"{env_prefix}_BASE_URL")
    env_api_key = os.environ.get(f"{env_prefix}_API_KEY")
    env_supports_streaming = os.environ.get(f"{env_prefix}_SUPPORTS_STREAMING")

    yaml_model = yaml_mapping.get("model")
    yaml_base_url = yaml_mapping.get("base_url")
    yaml_api_key = yaml_mapping.get("api_key")
    yaml_api_key_env = yaml_mapping.get("api_key_env")
    yaml_supports_streaming = yaml_mapping.get("supports_streaming")

    existing_model = existing.model if existing else None
    existing_base_url = existing.base_url if existing else None
    existing_api_key = existing.api_key if existing else None
    existing_supports_streaming = existing.supports_streaming if existing else True

    model = env_model or yaml_model or existing_model
    base_url = env_base_url or yaml_base_url or existing_base_url

    api_key_candidates = [
        env_api_key,
        yaml_api_key,
        os.environ.get(yaml_api_key_env) if yaml_api_key_env else None,
        existing_api_key,
    ]
    api_key = next((value for value in api_key_candidates if value is not None), None)

    if env_supports_streaming is not None:
        supports_streaming = _parse_bool(
            env_supports_streaming,
            default=existing_supports_streaming,
        )
    elif yaml_supports_streaming is not None:
        supports_streaming = _parse_bool(
            yaml_supports_streaming,
            default=existing_supports_streaming,
        )
    else:
        supports_streaming = existing_supports_streaming

    if model and base_url:
        return ModelEndpointConfig(
            model=model,
            base_url=base_url,
            api_key=api_key,
            supports_streaming=supports_streaming,
        )

    return None


def _parse_workspace(data: Mapping[str, object] | None, *, config_dir: Path) -> WorkspaceConfig:
    """Parse workspace configuration from YAML mapping."""

    path_value: Optional[str] = None
    confirm_on_start = True
    preview_base_url: Optional[str] = None

    if isinstance(data, Mapping):
        raw_path = data.get("path")
        if isinstance(raw_path, str) and raw_path.strip():
            path_value = raw_path.strip()
        elif raw_path not in (None, ""):
            logger.warning("Ignoring invalid workspace path configuration: %s", raw_path)

        if "confirm_on_start" in data:
            confirm_on_start = bool(data.get("confirm_on_start"))

        raw_preview = data.get("preview_base_url")
        if isinstance(raw_preview, str) and raw_preview.strip():
            preview_base_url = raw_preview.strip()
        elif raw_preview not in (None, ""):
            logger.warning("Ignoring invalid preview_base_url configuration: %s", raw_preview)

    workspace = WorkspaceConfig(
        path=path_value,
        confirm_on_start=confirm_on_start,
        preview_base_url=preview_base_url,
        _config_dir=config_dir,
    )

    logger.info(
        "Workspace configuration resolved (path=%s confirm_on_start=%s)",
        workspace.resolve_path(),
        workspace.confirm_on_start,
    )

    return workspace
