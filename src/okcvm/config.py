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

@dataclass(slots=True)
class ModelEndpointConfig:
    """Configuration for a single model endpoint."""

    model: str
    base_url: str
    api_key: Optional[str] = None

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
        if model and base_url:
            return cls(model=model, base_url=base_url, api_key=api_key)
        return None

    def describe(self) -> dict:
        """Return a serialisable view without leaking the API key."""

        description = {"model": self.model, "base_url": self.base_url}
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
class Config:
    """Top-level runtime configuration shared by the whole application."""

    chat: Optional[ModelEndpointConfig] = None
    media: MediaConfig = field(default_factory=MediaConfig)

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
    logger.info("Configuration updated: chat=%s, media_services=%s",
                bool(chat),
                [service for service, cfg in (
                    ("image", _config.media.image),
                    ("speech", _config.media.speech),
                    ("sound_effects", _config.media.sound_effects),
                    ("asr", _config.media.asr),
                ) if cfg])


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
        )


def load_config_from_yaml(path: Path) -> None:
    """Loads configuration from a YAML file and applies it."""
    if not path.exists():
        logger.warning("Config file not found at %s, skipping load.", path)
        return

    logger.info("Loading configuration from %s", path)
    with open(path, "r", encoding="utf-8") as f:
        data = yaml.safe_load(f)

    if not data:
        logger.warning("Config file at %s is empty, skipping.", path)
        return
        
    chat_config = data.get("chat")
    media_data = data.get("media", {})

    with _config_lock:
        if chat_config:
            api_key_env = chat_config.get("api_key_env")
            _config.chat = ModelEndpointConfig(
                model=chat_config.get("model"),
                base_url=chat_config.get("base_url"),
                api_key=chat_config.get("api_key")
                or (os.environ.get(api_key_env) if api_key_env else None),
            )

        _config.media = MediaConfig(
            image=_parse_endpoint(media_data, "image"),
            speech=_parse_endpoint(media_data, "speech"),
            sound_effects=_parse_endpoint(media_data, "sound_effects"),
            asr=_parse_endpoint(media_data, "asr"),
        )

    print("👍 Configuration loaded successfully from YAML.")


def _parse_endpoint(data: dict, key: str) -> ModelEndpointConfig | None:
    """Helper to parse an endpoint from a dict."""
    endpoint_data = data.get(key)
    if not endpoint_data or not endpoint_data.get("model"):
        return None
    
    api_key_env = endpoint_data.get("api_key_env")
    api_key = endpoint_data.get("api_key") or (os.environ.get(api_key_env) if api_key_env else None)

    return ModelEndpointConfig(
        model=endpoint_data["model"],
        base_url=endpoint_data.get("base_url"),
        api_key=api_key
    )
