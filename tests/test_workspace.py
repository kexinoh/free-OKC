
"""Tests for workspace path resolution helpers."""

from __future__ import annotations

from pathlib import Path

import pytest

from okcvm.workspace import WorkspaceManager


def test_workspace_cleanup_removes_directory(tmp_path: Path) -> None:
    manager = WorkspaceManager(base_dir=tmp_path)
    internal_root = manager.paths.internal_root
    assert internal_root.exists()

    removed = manager.cleanup()
    assert removed is True
    assert not internal_root.exists()

    # second call is a no-op
    removed_again = manager.cleanup()
    assert removed_again is False
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


def test_git_snapshots_round_trip(tmp_path: Path) -> None:
    """Workspace state manager can snapshot and restore file contents."""

    manager = WorkspaceManager(base_dir=tmp_path)
    state = manager.state

    if not getattr(state, "enabled", False):
        pytest.skip("Git not available in test environment")

    first_file = manager.resolve("notes.txt")
    first_file.write_text("version one", encoding="utf-8")

    snap_one = state.snapshot("Initial notes")
    assert isinstance(snap_one, str)
    assert len(snap_one) >= 7

    first_file.write_text("version two", encoding="utf-8")
    snap_two = state.snapshot("Updated notes")
    assert snap_one != snap_two

    snapshots = state.list_snapshots(limit=5)
    assert any(entry["id"] == snap_two for entry in snapshots)

    restored = state.restore(snap_one)
    assert restored is True
    assert first_file.read_text(encoding="utf-8") == "version one"
