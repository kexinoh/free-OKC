"""OKCVM package exposing spec loading helpers, tools and configuration."""

from . import spec  # noqa: F401
from .config import (  # noqa: F401
    Config,
    MediaConfig,
    ModelEndpointConfig,
    configure,
    get_config,
    reset_config,
)
from .json_safe import patch_json_decoder
from .registry import ToolRegistry  # noqa: F401
from .vm import VirtualMachine  # noqa: F401

patch_json_decoder()

__all__ = [
    "spec",
    "ToolRegistry",
    "VirtualMachine",
    "Config",
    "MediaConfig",
    "ModelEndpointConfig",
    "configure",
    "get_config",
    "reset_config",
]
