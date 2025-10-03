from pathlib import Path

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
