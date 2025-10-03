"""Tests for file tools helpers."""

from __future__ import annotations

from pathlib import Path

import pytest
from okcvm.tools import files


def test_ensure_absolute_accepts_native_absolute(tmp_path: Path) -> None:
    result = files._ensure_absolute(str(tmp_path))
    assert result == tmp_path


def test_ensure_absolute_normalises_posix_path_on_windows(monkeypatch) -> None:
    dummy_drive = type("Dummy", (), {"drive": "C:"})()

    monkeypatch.setattr(files.os, "name", "nt", raising=False)
    monkeypatch.setattr(files.Path, "cwd", classmethod(lambda cls: dummy_drive))
    monkeypatch.setattr(files.Path, "home", classmethod(lambda cls: dummy_drive))

    result = files._ensure_absolute("/tmp/hello/world.txt")
    assert result.as_posix() == "C:/tmp/hello/world.txt"


def test_ensure_absolute_rejects_relative_path() -> None:
    with pytest.raises(files.ToolError):
        files._ensure_absolute("relative/path.txt")
