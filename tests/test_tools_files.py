"""Tests for file tools helpers."""

from __future__ import annotations

from pathlib import Path, PosixPath

import pytest
from okcvm.spec import ToolSpec
from okcvm.workspace import WorkspaceError
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


def test_ensure_absolute_errors_when_workspace_rejects_absolute() -> None:
    class RejectingWorkspace:
        def resolve(self, raw_path: str):  # pragma: no cover - simple stub
            raise WorkspaceError("outside of workspace")

    with pytest.raises(files.ToolError) as exc:
        files._ensure_absolute("/etc/passwd", workspace=RejectingWorkspace())

    assert "outside of workspace" in str(exc.value)


def _write_spec() -> ToolSpec:
    return ToolSpec(
        name="mshtools-write_file",
        description="",
        parameters={
            "type": "object",
            "properties": {
                "file_path": {"type": "string"},
                "content": {"type": "string"},
                "append": {"type": "boolean"},
            },
            "required": ["file_path", "content"],
            "additionalProperties": False,
        },
        returns={"type": "object"},
    )


def test_write_file_accepts_posix_absolute_on_windows(monkeypatch, tmp_path) -> None:
    """Simulate invoking the write tool with a POSIX absolute path on Windows."""

    real_path = PosixPath

    class FakePath:
        _drive_override = ""

        def __init__(self, value):
            if isinstance(value, FakePath):
                self._path = real_path(str(value))
            elif isinstance(value, real_path):
                self._path = real_path(str(value))
            else:
                self._path = real_path(value)

        @property
        def drive(self):
            return self._drive_override or self._path.drive

        @classmethod
        def cwd(cls):
            return cls(cls._drive_override or str(tmp_path))

        @classmethod
        def home(cls):
            return cls(cls._drive_override or str(tmp_path))

        def is_absolute(self):
            text = self._path.as_posix()
            if text.startswith("/tmp/resume"):
                return False
            return self._path.is_absolute()

        @property
        def parent(self):
            return FakePath(self._path.parent)

        def mkdir(self, *args, **kwargs):
            self._path.mkdir(*args, **kwargs)

        def open(self, *args, **kwargs):
            return self._path.open(*args, **kwargs)

        def exists(self):
            return self._path.exists()

        def read_text(self, *args, **kwargs):
            return self._path.read_text(*args, **kwargs)

        def write_text(self, *args, **kwargs):
            return self._path.write_text(*args, **kwargs)

        def as_posix(self):
            return self._path.as_posix()

        def __fspath__(self):
            return str(self._path)

        def __str__(self) -> str:
            return str(self._path)

    FakePath._drive_override = tmp_path.as_posix()

    monkeypatch.setattr(files, "Path", FakePath, raising=False)
    monkeypatch.setattr(files.os, "name", "nt", raising=False)

    tool = files.WriteFileTool(_write_spec())
    result = tool.call(file_path="/tmp/resume/index.html", content="hello")

    written_path = PosixPath(result.data["path"])
    assert written_path.exists()
    assert written_path.read_text(encoding="utf-8") == "hello"
    assert str(written_path).startswith(tmp_path.as_posix())
