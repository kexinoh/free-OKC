"""Runtime configuration helpers for OKCVM tools.

This module provides a very small configuration system that focuses on tools
which integrate with external multimodal models (image generation, speech
synthesis, sound effect generation, automatic speech recognition, ...).

The reference implementation keeps the actual media generation deterministic
for testability, but production deployments are expected to forward requests
to real model endpoints.  To make that integration straightforward we expose
lightweight dataclasses that capture the information users need to provide:

* ``base_url`` – the inference endpoint that should receive requests.
* ``model`` – the specific model identifier to use at that endpoint.
* ``api_key`` – the credential required by the provider (optional).

Users can either populate these values programmatically by calling
``okcvm.config.configure`` or by defining environment variables before the
package is imported.  The expected environment variable names follow the
pattern ``OKCVM_<SERVICE>_BASE_URL``/``MODEL``/``API_KEY`` (e.g.
``OKCVM_IMAGE_BASE_URL``).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Mapping, MutableMapping, Optional
import os


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


_UNSET = object()


@dataclass(slots=True)
class Config:
    """Top-level runtime configuration."""

    media: MediaConfig = field(default_factory=MediaConfig)
    chat: ModelEndpointConfig | None = None

    def update(
        self,
        *,
        media: MediaConfig | None = None,
        chat: ModelEndpointConfig | None | object = _UNSET,
    ) -> None:
        if media is not None:
            self.media = media
        if chat is not _UNSET:
            self.chat = chat  # type: ignore[assignment]


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


_CONFIG = Config(media=_load_media_from_env(), chat=_load_chat_from_env())


def configure(
    *,
    media: MediaConfig | None = None,
    chat: ModelEndpointConfig | None | object = _UNSET,
) -> None:
    """Update the process-wide configuration.

    Example
    -------
    >>> from okcvm.config import configure, MediaConfig, ModelEndpointConfig
    >>> configure(
    ...     media=MediaConfig(
    ...         image=ModelEndpointConfig(
    ...             model="my-image-model",
    ...             base_url="https://api.example.com/v1/images",
    ...             api_key="sk-...",
    ...         ),
    ...     )
    ... )
    """

    _CONFIG.update(media=media, chat=chat)


def get_config() -> Config:
    """Return the active configuration instance."""

    return _CONFIG


def reset_config(env: Mapping[str, str] | None = None) -> None:
    """Reset configuration to match the environment (mainly for tests)."""

    global _CONFIG
    _CONFIG = Config(media=_load_media_from_env(env), chat=_load_chat_from_env(env))


__all__ = [
    "Config",
    "MediaConfig",
    "ModelEndpointConfig",
    "configure",
    "get_config",
    "reset_config",
]

