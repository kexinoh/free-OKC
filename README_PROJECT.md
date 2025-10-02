# OKCVM

OKCVM is an open-source virtual machine container orchestration layer that mirrors the system prompt and tool contract of Moonshot AI's "OK Computer" agent. It bundles the system prompt, the tool specifications, and Python implementations for a subset of the tools so that independent projects can self-host the workflow.

## Features

- System prompt and tool manifest stored as canonical spec files.
- Declarative tool registry that validates implementation consistency with the manifest.
- Reference implementations for core tools (todo management, shell, file IO, Python execution).
- Extensible plugin interface for adding additional tools over time.

## Getting Started

```bash
pip install -e .[dev]
```

```python
from okcvm.vm import VirtualMachine
from okcvm.registry import ToolRegistry
from okcvm import spec

registry = ToolRegistry.from_default_spec()
vm = VirtualMachine(system_prompt=spec.load_system_prompt(), registry=registry)

result = vm.call_tool("mshtools-shell", command="echo hello")
print(result.output)
```

## Testing

```bash
pytest
```

## License

MIT
