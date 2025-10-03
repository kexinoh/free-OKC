"""Tool registry that binds specifications to implementations."""

from __future__ import annotations

import json
from typing import Dict, Iterable, List, Mapping

from . import spec as spec_module
from .spec import ToolSpec
from .tools.base import Tool, ToolResult


def _safe_json_value(value: object) -> object:
    """Return a JSON-serialisable representation of ``value``."""

    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, (list, dict)):
        return value
    try:
        json.dumps(value, ensure_ascii=False)
        return value
    except TypeError:
        return repr(value)
from .tools import (
    browser,
    data_sources,
    deployment,
    files,
    ipython,
    media,
    search,
    shell,
    slides,
    stubs,
    todo,
)


class ToolRegistry:
    """Registry providing lookup and invocation for tools."""

    def __init__(self, specs: Iterable[ToolSpec]):
        self._specs: Dict[str, ToolSpec] = {item.name: item for item in specs}
        self._tools: Dict[str, Tool] = {}
        self._langchain_cache: Dict[str, object] = {}

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
        self._langchain_cache.pop(tool.name, None)

    def register_default_implementations(self) -> None:
        mapping: Mapping[str, type[Tool]] = {
            todo.TodoReadTool.name: todo.TodoReadTool,
            todo.TodoWriteTool.name: todo.TodoWriteTool,
            ipython.IPythonTool.name: ipython.IPythonTool,
            files.ReadFileTool.name: files.ReadFileTool,
            files.EditFileTool.name: files.EditFileTool,
            files.WriteFileTool.name: files.WriteFileTool,
            shell.ShellTool.name: shell.ShellTool,
            browser.BrowserVisitTool.name: browser.BrowserVisitTool,
            browser.BrowserStateTool.name: browser.BrowserStateTool,
            browser.BrowserFindTool.name: browser.BrowserFindTool,
            browser.BrowserClickTool.name: browser.BrowserClickTool,
            browser.BrowserInputTool.name: browser.BrowserInputTool,
            browser.BrowserScrollDownTool.name: browser.BrowserScrollDownTool,
            browser.BrowserScrollUpTool.name: browser.BrowserScrollUpTool,
            search.WebSearchTool.name: search.WebSearchTool,
            search.ImageSearchTool.name: search.ImageSearchTool,
            media.GenerateImageTool.name: media.GenerateImageTool,
            media.GetAvailableVoicesTool.name: media.GetAvailableVoicesTool,
            media.GenerateSpeechTool.name: media.GenerateSpeechTool,
            media.GenerateSoundEffectsTool.name: media.GenerateSoundEffectsTool,
            data_sources.GetDataSourceDescTool.name: data_sources.GetDataSourceDescTool,
            data_sources.GetDataSourceTool.name: data_sources.GetDataSourceTool,
            deployment.DeployWebsiteTool.name: deployment.DeployWebsiteTool,
            slides.SlidesGeneratorTool.name: slides.SlidesGeneratorTool,
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

    def get_langchain_tools(self) -> List[object]:
        """Return LangChain compatible wrappers for the registered tools."""

        try:
            from langchain_core.tools import ToolException
            from langchain.tools import Tool as LangChainTool
        except ImportError as exc:  # pragma: no cover - defensive guard
            raise RuntimeError(
                "LangChain is not installed. Install the 'langchain' and "
                "'langchain-openai' packages to enable agent execution."
            ) from exc

        tools: List[object] = []
        for name, tool in self._tools.items():
            cached = self._langchain_cache.get(name)
            if cached is None:
                description = tool.spec.description or tool.spec.name

                def _make_invoker(current_tool: Tool, tool_name: str):
                    def _invoke(raw_input: str) -> str:
                        payload = raw_input.strip()
                        if not payload:
                            arguments: Mapping[str, object] = {}
                        else:
                            try:
                                data = json.loads(payload)
                            except json.JSONDecodeError as json_error:
                                raise ToolException(
                                    f"{tool_name} expects a JSON object as input."
                                ) from json_error
                            if not isinstance(data, dict):
                                raise ToolException(
                                    f"{tool_name} expects a JSON object as input."
                                )
                            arguments = dict(data)

                        result = current_tool.call(**arguments)
                        if not result.success:
                            raise ToolException(result.error or f"{tool_name} failed")

                        payload_dict = {
                            "output": _safe_json_value(result.output),
                            "data": _safe_json_value(result.data),
                        }
                        return json.dumps(payload_dict, ensure_ascii=False)

                    _invoke.__name__ = f"invoke_{tool_name.replace('-', '_')}"
                    _invoke.__doc__ = (
                        f"Invoke the OKCVM tool '{tool_name}'. Provide a JSON object "
                        "containing the tool parameters as described in the tool "
                        "manifest."
                    )
                    return _invoke

                invoker = _make_invoker(tool, name)
                langchain_tool = LangChainTool.from_function(
                    name=name,
                    description=(
                        f"{description}\n\nInput format: provide a JSON object with the "
                        "parameters expected by the tool."
                    ),
                    func=invoker,
                )
                self._langchain_cache[name] = langchain_tool
                cached = langchain_tool
            tools.append(cached)
        return tools
