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

## Configuring media generation

The reference media tools (image generation, speech synthesis, sound effect
generation and future ASR helpers) assume you have access to a model endpoint.
Provide the connection details by either setting environment variables or by
configuring the library programmatically:

```bash
export OKCVM_IMAGE_MODEL=my-image-model
export OKCVM_IMAGE_BASE_URL=https://api.example.com/v1/images
export OKCVM_IMAGE_API_KEY=sk-example
```

```python
from okcvm.config import MediaConfig, ModelEndpointConfig, configure

configure(
    media=MediaConfig(
        image=ModelEndpointConfig(
            model="my-image-model",
            base_url="https://api.example.com/v1/images",
            api_key="sk-example",
        ),
        speech=ModelEndpointConfig(
            model="my-tts-model",
            base_url="https://api.example.com/v1/speech",
        ),
        sound_effects=ModelEndpointConfig(
            model="my-sfx-model",
            base_url="https://api.example.com/v1/audio",
        ),
    ),
)
```

The built-in implementations still return deterministic mock data for
repeatable tests, but the configuration metadata is now available for projects
that want to proxy requests to real providers.

## License

MIT
