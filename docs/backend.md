# Backend internals

The backend is a Python orchestrator that bundles the upstream OK Computer prompt,
tool catalogue, LangChain-powered runtime, and a FastAPI surface. This document
covers the moving parts you will touch most often when extending the system.

## Configuration management
- [`okcvm.config`](../src/okcvm/config.py) defines dataclasses for chat endpoints,
  media providers, and workspace settings. It supports layered loading from YAML,
  environment variables, and in-memory overrides, exposing thread-safe `configure`
  and `get_config` helpers for both CLI and API callers. [src/okcvm/config.py#L25-L227](../src/okcvm/config.py#L25-L227)
- `load_config_from_yaml` resolves relative paths against the project root,
  applies defaults, and prepares workspace directories before runtime
  initialisation. [src/okcvm/config.py#L177-L227](../src/okcvm/config.py#L177-L227)
- The FastAPI `/api/config` route deserialises incoming payloads into the same
  dataclasses, redacts secrets in logs, and reuses `configure` so operators can
  adjust credentials without restarts. [src/okcvm/api/main.py#L210-L256](../src/okcvm/api/main.py#L210-L256)
- Request payloads flow through [`okcvm.api.models`](../src/okcvm/api/models.py),
  which maps JSON into runtime dataclasses while preserving unset API keys and
  validating snapshot operations. [src/okcvm/api/models.py#L1-L80](../src/okcvm/api/models.py#L1-L80)

## Tool registry and workspace injection
- [`okcvm.registry.ToolRegistry`](../src/okcvm/registry.py) parses the packaged
  tool specification, registers Python implementations, and injects a
  `WorkspaceManager` into tools that declare `requires_workspace`, ensuring file
  operations stay within the session sandbox. [src/okcvm/registry.py#L1-L200](../src/okcvm/registry.py#L1-L200)
- Custom tools live in [`okcvm/tools`](../src/okcvm/tools). Highlights include
  deployment helpers, slide generation, shell access, and data ingestion stubs.
  Each tool adheres to the manifest schema and often wraps shared helpers from
  `okcvm.tools.base`. [src/okcvm/tools/deployment.py#L40-L208](../src/okcvm/tools/deployment.py#L40-L208) [src/okcvm/tools/slides.py#L12-L78](../src/okcvm/tools/slides.py#L12-L78)

## LangChain integration
- [`okcvm.llm.create_llm_chain`](../src/okcvm/llm.py) builds a LangChain
  `AgentExecutor` backed by the configured chat model, binds registered tools, and
  returns a callable used by the virtual machine for every chat turn. [src/okcvm/llm.py#L13-L57](../src/okcvm/llm.py#L13-L57)
- [`okcvm.vm.VirtualMachine`](../src/okcvm/vm.py) stores conversation history,
  lazily constructs the LangChain chain, adapts messages into the required
  structure, records tool invocations, and generates telemetry for the
  frontend. [src/okcvm/vm.py#L26-L178](../src/okcvm/vm.py#L26-L178)
- [`okcvm.session.SessionState`](../src/okcvm/session.py) orchestrates the runtime
  by wiring the registry, VM, and workspace together. It exposes high-level
  methods (`boot`, `respond`, `snapshot_workspace`, etc.) consumed by the API and
  returns JSON-ready payloads with normalised previews, deduplicated artefacts,
  and client-aware URLs for the frontend. [src/okcvm/session.py#L22-L279](../src/okcvm/session.py#L22-L279)

## FastAPI surface
- [`okcvm.api.main`](../src/okcvm/api/main.py) creates the FastAPI app, mounts the
  static frontend, adds CORS and structured request logging middleware, and keeps
  track of per-client sessions via `SessionStore` and the shared `AppState`
  helper. [src/okcvm/api/main.py#L30-L206](../src/okcvm/api/main.py#L30-L206)
- REST endpoints expose configuration CRUD, session boot, chat, history lookup,
  workspace snapshot management, and deployment asset serving. `_resolve_deployment_asset`
  enforces path safety while appending `client_id` context so previews remain
  scoped to the requesting session. Error handling normalises exceptions into
  HTTP responses with helpful messages for operators. [src/okcvm/api/main.py#L146-L309](../src/okcvm/api/main.py#L146-L309)

## Command line interface
- [`okcvm.server:cli`](../src/okcvm/server.py) is a Typer app that loads
  configuration, verifies workspace paths, and launches Uvicorn. Use
  `python -m okcvm.server --reload` for local development or embed the CLI into
  supervisor scripts in production. [src/okcvm/server.py#L1-L88](../src/okcvm/server.py#L1-L88)
- The legacy entrypoint in [`main.py`](../main.py) still exposes Typer commands
  for compatibility; prefer the dedicated server module for new tooling. [main.py#L1-L175](../main.py#L1-L175)

## Testing
- `pytest` coverage spans configuration, FastAPI routes, virtual machine
  behaviour, workspace safety, and tool interactions. Start with [`tests/test_api_app.py`](../tests/test_api_app.py) and [`tests/test_workspace.py`](../tests/test_workspace.py) when debugging
  regressions. [tests/test_api_app.py#L1-L145](../tests/test_api_app.py#L1-L145) [tests/test_workspace.py#L1-L24](../tests/test_workspace.py#L1-L24)
- Add regression tests alongside new features; the suite runs quickly and is a
  prerequisite for merging into main.
