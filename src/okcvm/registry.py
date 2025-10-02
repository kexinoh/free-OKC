"""Tool registry that binds specifications to implementations."""

from __future__ import annotations

from typing import Dict, Iterable, List, Mapping

from . import spec as spec_module
from .spec import ToolSpec
from .tools.base import Tool, ToolResult
from .tools import files, ipython, shell, stubs, todo


class ToolRegistry:
    """Registry providing lookup and invocation for tools."""

    def __init__(self, specs: Iterable[ToolSpec]):
        self._specs: Dict[str, ToolSpec] = {item.name: item for item in specs}
        self._tools: Dict[str, Tool] = {}

    @classmethod
    def from_default_spec(cls) -> "ToolRegistry":
        specs = spec_module.load_tool_specs()
        registry = cls(specs)
        registry.register_default_implementations()
        return registry

    def register(self, tool: Tool) -> None:
        spec = self._specs.get(tool.name)
        if not spec:
            raise KeyError(f"Tool '{tool.name}' is not part of the manifest")
        self._tools[tool.name] = tool

    def register_default_implementations(self) -> None:
        mapping: Mapping[str, type[Tool]] = {
            todo.TodoReadTool.name: todo.TodoReadTool,
            todo.TodoWriteTool.name: todo.TodoWriteTool,
            ipython.IPythonTool.name: ipython.IPythonTool,
            files.ReadFileTool.name: files.ReadFileTool,
            files.EditFileTool.name: files.EditFileTool,
            files.WriteFileTool.name: files.WriteFileTool,
            shell.ShellTool.name: shell.ShellTool,
        }
        stub_messages = {}
        for name in self._specs:
            if name not in mapping:
                if name.startswith("mshtools-browser"):
                    stub_messages[name] = (
                        "Browser automation is not included in the reference implementation."
                    )
                else:
                    stub_messages[name] = (
                        "This tool is not yet implemented in OKCVM; contributions welcome!"
                    )

        for name, cls in mapping.items():
            spec = self._specs.get(name)
            if spec:
                self.register(cls(spec))
        for name, message in stub_messages.items():
            if name not in self._tools:
                spec = self._specs[name]
                self.register(stubs.StubTool(spec, message))

    def get(self, name: str) -> Tool:
        try:
            return self._tools[name]
        except KeyError as exc:
            raise KeyError(f"Tool '{name}' is not registered") from exc

    def call(self, name: str, **kwargs) -> ToolResult:
        tool = self.get(name)
        return tool.call(**kwargs)

    def list_specs(self) -> List[ToolSpec]:
        return list(self._specs.values())

    def described_tools(self) -> List[dict]:
        return [tool.describe() for tool in self._tools.values()]

    def missing_tools(self) -> List[str]:
        return [name for name in self._specs if name not in self._tools]
