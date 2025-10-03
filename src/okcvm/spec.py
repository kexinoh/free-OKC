"""Load system prompt and tool specifications for OKCVM."""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List, Sequence


DEFAULT_SPEC_DIR = Path(__file__).resolve().parents[2] / "spec"
SYSTEM_PROMPT_FILENAME = "system_prompt.md"
TOOLS_FILENAME = "tools.json"


SCALAR_JSON_TYPES = {
    "null",
    "boolean",
    "object",
    "array",
    "number",
    "string",
    "integer",
}


def _ensure_json_type(value: str, *, field: str, context: str) -> None:
    if value not in SCALAR_JSON_TYPES:
        msg = f"Unsupported JSON schema type '{value}' for {field} in {context}"
        raise ValueError(msg)


def _validate_required_list(values: Sequence[str], *, field: str, context: str) -> None:
    if not all(isinstance(item, str) and item for item in values):
        raise ValueError(f"All entries in '{field}' for {context} must be non-empty strings")


def _validate_json_schema(schema: dict, *, field: str, context: str) -> None:
    if not isinstance(schema, dict):
        raise TypeError(f"'{field}' for {context} must be a mapping")

    type_value = schema.get("type")
    if type_value is None:
        raise ValueError(f"Missing 'type' declaration in {field} for {context}")

    if isinstance(type_value, str):
        _ensure_json_type(type_value, field=field, context=context)
    elif isinstance(type_value, list):
        if not type_value:
            raise ValueError(f"'{field}' type list for {context} cannot be empty")
        for item in type_value:
            if not isinstance(item, str):
                raise TypeError(f"Entries in '{field}' type list for {context} must be strings")
            _ensure_json_type(item, field=field, context=context)
    else:
        raise TypeError(f"'{field}' type for {context} must be a string or list of strings")

    if "enum" in schema:
        enum_values = schema["enum"]
        if not isinstance(enum_values, list) or not enum_values:
            raise ValueError(f"'enum' for {context} must be a non-empty list when provided")

    if "required" in schema:
        required_values = schema["required"]
        if not isinstance(required_values, list) or not required_values:
            raise ValueError(f"'required' for {context} must be a non-empty list when provided")
        _validate_required_list(required_values, field="required", context=context)

    if isinstance(type_value, list):
        type_members = set(type_value)
    else:
        type_members = {type_value}

    properties = schema.get("properties")
    if properties is not None:
        if "object" not in type_members:
            raise ValueError(f"'properties' is only valid for object types in {context}")
        if not isinstance(properties, dict):
            raise TypeError(f"'properties' for {context} must be a mapping")
        for name, subschema in properties.items():
            if not isinstance(name, str) or not name:
                raise ValueError(f"Property names for {context} must be non-empty strings")
            _validate_json_schema(subschema, field=f"property '{name}'", context=context)

    if "items" in schema:
        if "array" not in type_members:
            raise ValueError(f"'items' is only valid for array types in {context}")
        items_schema = schema["items"]
        if isinstance(items_schema, dict):
            _validate_json_schema(items_schema, field="items", context=context)
        elif isinstance(items_schema, list):
            for index, subschema in enumerate(items_schema):
                _validate_json_schema(subschema, field=f"items[{index}]", context=context)
        else:
            raise TypeError(f"'items' for {context} must be a schema object or list of schema objects")

    if "additionalProperties" in schema:
        additional_properties = schema["additionalProperties"]
        if isinstance(additional_properties, dict):
            _validate_json_schema(additional_properties, field="additionalProperties", context=context)
        elif not isinstance(additional_properties, bool):
            raise TypeError(
                f"'additionalProperties' for {context} must be a boolean or schema mapping"
            )


@dataclass
class ToolSpec:
    """Schema describing a tool contract."""

    name: str
    description: str
    parameters: dict
    returns: dict

    def __post_init__(self) -> None:
        _validate_json_schema(self.parameters, field="parameters", context=self.name)
        _validate_json_schema(self.returns, field="returns", context=self.name)

    @classmethod
    def from_mapping(cls, mapping: dict) -> "ToolSpec":
        missing = {key for key in ("name", "parameters", "returns") if key not in mapping}
        if missing:
            missing_fields = ", ".join(sorted(missing))
            raise ValueError(f"Tool specification missing required fields: {missing_fields}")

        description = mapping.get("description", "")
        if not isinstance(description, str):
            raise TypeError("Tool specification 'description' must be a string if provided")

        return cls(
            name=mapping["name"],
            description=description,
            parameters=mapping["parameters"],
            returns=mapping["returns"],
        )


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
