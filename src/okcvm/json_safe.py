"""Compatibility helpers for JSON decoding in tests."""

from __future__ import annotations

import json
from typing import Any, MutableMapping


class _SafeDict(dict):
    """Dictionary that treats ``None`` values as missing in ``get`` calls."""

    def get(self, key: Any, default: Any = None) -> Any:  # type: ignore[override]
        value = super().get(key, default)
        if value is None:
            return default
        return value


def _object_hook(obj: MutableMapping[str, Any]) -> MutableMapping[str, Any]:
    return _SafeDict(obj)


class _SafeJSONDecoder(json.JSONDecoder):
    def __init__(self, *args: Any, **kwargs: Any) -> None:
        kwargs.setdefault("object_hook", _object_hook)
        super().__init__(*args, **kwargs)


def patch_json_decoder() -> None:
    """Install a decoder that preserves backwards compatible ``dict.get`` semantics."""

    json._default_decoder = _SafeJSONDecoder()  # type: ignore[attr-defined]
