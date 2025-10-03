# Roadmap

## Implemented Capabilities

### Canonical prompt and tool specification bundling
The project still ships the upstream OK Computer system prompt and tool manifest so
embedders can initialise the VM with zero additional configuration.
- `okcvm.spec` exposes dataclasses and helpers that read the packaged
  `system_prompt.md` and `tools.json`, returning structured specifications for
  downstream consumers. ([`src/okcvm/spec.py`](./src/okcvm/spec.py))

### LangChain-powered virtual machine runtime
We replaced the earlier stubbed façade with a real LangChain agent executor that
binds the packaged tools and routes conversations to a configurable chat model.
- `okcvm.llm.create_llm_chain` wires LangChain's `ChatOpenAI` client to the
  registry's tool set and builds a tool-calling agent template that honours the
  VM's conversation history. ([`src/okcvm/llm.py`](./src/okcvm/llm.py))
- `okcvm.vm.VirtualMachine` now converts the stored history into LangChain
  messages, invokes the agent, records intermediate tool calls, and keeps a
  detailed trace that powers the UI's model log. ([`src/okcvm/vm.py`](./src/okcvm/vm.py))

### Runtime configuration and CLI experience
We introduced a thread-safe configuration layer, YAML/env loading, and a Typer
CLI so operators can manage endpoints without editing code.
- `okcvm.config` provides dataclasses for chat and media endpoints, helpers for
  environment/YAML sources, and atomic updates that feed both the API and
  runtime. ([`src/okcvm/config.py`](./src/okcvm/config.py))
- The top-level `main.py` exposes commands for launching the server, validating
  config, and inspecting registered tools, including environment loading and
  dependency checks. ([`main.py`](./main.py))

### Observability and HTTP surface
The orchestrator now emits structured logs and request traces so deployments are
inspectable out of the box.
- `okcvm.logging_utils` configures Rich console output plus rotating file
  handlers, while `okcvm.api.main` wraps FastAPI with request logging middleware
  and mounts the bundled frontend. ([`src/okcvm/logging_utils.py`](./src/okcvm/logging_utils.py),
  [`src/okcvm/api/main.py`](./src/okcvm/api/main.py))

### Session management and chat workflow
Session state is no longer mocked—requests flow through the VM and return tool
metadata for the UI to render richer previews.
- `okcvm.session.SessionState` wires the registry, VM, and configuration,
  streaming tool call summaries, meta telemetry, and previews back to clients.
  ([`src/okcvm/session.py`](./src/okcvm/session.py))
- `/api/session/*` and `/api/chat` endpoints expose boot, info, and chat
  workflows, trimming payloads and surfacing validation feedback. ([`src/okcvm/api/main.py`](./src/okcvm/api/main.py))

### Frontend control panel enhancements
The bundled UI matured into a productivity dashboard with persistent
conversations, configuration drawer, and multi-modal previews.
- `frontend/index.html` adds a history sidebar, settings overlay, and dedicated
  insight panels for chat logs, web previews, and slide decks.
- `frontend/app.js` synchronises configuration with the backend, caches
  conversations in localStorage, handles accessibility shortcuts, and updates
  previews as tool outputs arrive.

### Comprehensive regression test suite
Unit tests now cover the API surface, configuration helpers, LangChain chain
wiring, and tool registry so new changes remain safe.
- The `tests/` directory exercises the FastAPI app, configuration loaders,
  LangChain integration, and individual tool implementations.

## Planned and In-Progress Work

### Richer tool output rendering
Tool payloads still need structured adapters so the web UI can render HTML and
PPT assets without manual inspection.
- Capture slide/page metadata and binary assets in a standard schema and extend
  `SessionState.respond` to map them into previews automatically.

### Streaming and multi-turn fidelity
The current agent executor runs synchronously and returns only the final reply.
- Investigate LangChain streaming callbacks to surface partial responses and
  tool progress to the UI.
- Persist VM history per session server-side so refreshes and multiple clients
  can share context safely.

### Expanded media and deployment integrations
Only a subset of OK Computer's media endpoints ship with live implementations.
- Continue adding reference integrations for speech, sound effects, and
  deployment targets with consistent credential handling.

### Advanced browser automation
The HTTP-based browser tool remains intentionally lightweight.
- Explore Playwright/Selenium backends with resource controls while keeping the
  deterministic crawler for tests and offline mode.

### Packaging and distribution
We want operators to get started without cloning the repo.
- Produce container images and PyPI wheels that bundle the CLI, API, and
  frontend assets with sensible defaults.
