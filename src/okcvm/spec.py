"""Load system prompt and tool specifications for OKCVM."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List


DEFAULT_SPEC_DIR = Path(__file__).resolve().parents[2] / "spec"
SYSTEM_PROMPT_FILENAME = "system_prompt.md"
TOOLS_FILENAME = "tools.json"


@dataclass
class ToolSpec:
    """Schema describing a tool contract."""

    name: str
    description: str

    @classmethod
    def from_mapping(cls, mapping: dict) -> "ToolSpec":
        return cls(name=mapping["name"], description=mapping.get("description", ""))


def load_system_prompt(path: Path | None = None) -> str:
    """Return the canonical system prompt string.

    Parameters
    ----------
    path:
        Optional override to a system prompt path. Defaults to the packaged
        specification directory.
    """

    prompt_path = path or (DEFAULT_SPEC_DIR / SYSTEM_PROMPT_FILENAME)
    return prompt_path.read_text(encoding="utf-8")


def load_tool_specs(path: Path | None = None) -> List[ToolSpec]:
    """Return the structured tool specifications from the manifest."""

    tools_path = path or (DEFAULT_SPEC_DIR / TOOLS_FILENAME)
    data = json.loads(tools_path.read_text(encoding="utf-8"))
    functions: Iterable[dict] = data.get("functions", [])
    return [ToolSpec.from_mapping(item) for item in functions]


def load_bundle(spec_dir: Path | None = None) -> tuple[str, List[ToolSpec]]:
    """Load both the system prompt and tool specifications."""

    directory = spec_dir or DEFAULT_SPEC_DIR
    prompt = load_system_prompt(directory / SYSTEM_PROMPT_FILENAME)
    tools = load_tool_specs(directory / TOOLS_FILENAME)
    return prompt, tools
