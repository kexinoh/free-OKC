"""Tests for workspace path resolution helpers."""

from __future__ import annotations

from pathlib import Path

from okcvm.workspace import WorkspaceManager


def test_resolve_anchors_generic_absolute_path(tmp_path: Path) -> None:
    """Absolute paths outside the mount are mapped inside the workspace."""

    manager = WorkspaceManager(base_dir=tmp_path)

    resolved = manager.resolve("/tmp/hello/world.txt")

    expected = manager.paths.internal_root / "tmp" / "hello" / "world.txt"
    assert resolved == expected


def test_resolve_preserves_relative_path(tmp_path: Path) -> None:
    """Relative paths remain relative to the workspace root."""

    manager = WorkspaceManager(base_dir=tmp_path)

    resolved = manager.resolve("project/readme.md")

    expected = manager.paths.internal_root / "project" / "readme.md"
    assert resolved == expected
