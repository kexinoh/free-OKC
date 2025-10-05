# Backend internals

The backend is a Python orchestrator that bundles the upstream OK Computer prompt,
tool catalogue, LangChain-powered runtime, and a FastAPI surface. This document
covers the moving parts you will touch most often when extending the system.

## Configuration management
- [`okcvm.config`](../src/okcvm/config.py) defines dataclasses for chat/media
  endpoints, workspace settings, and the SQL-backed conversation store while
  keeping a thread-safe global `Config`. CLI and API callers therefore read the
  same state. [src/okcvm/config.py#L49-L307](../src/okcvm/config.py#L49-L307)
- `load_config_from_yaml` resolves relative paths, prepares the workspace
  directory, and merges YAML values with environment overrides before calling
  `configure`. [src/okcvm/config.py#L311-L374](../src/okcvm/config.py#L311-L374)
- The FastAPI `/api/config` route maps payloads into the endpoint dataclasses,
  preserves previously supplied secrets, and applies the update atomically.
  [src/okcvm/api/main.py#L423-L523](../src/okcvm/api/main.py#L423-L523)
- Request models in [`okcvm.api.models`](../src/okcvm/api/models.py) validate
  streaming flags, workspace snapshot payloads, and conversation persistence
  updates while ensuring unset API keys are not cleared accidentally.
  [src/okcvm/api/models.py#L10-L95](../src/okcvm/api/models.py#L10-L95)

## Tool registry and workspace injection
- [`okcvm.registry.ToolRegistry`](../src/okcvm/registry.py) parses the packaged
  tool specification, registers Python implementations, and injects a
  `WorkspaceManager` into tools that declare `requires_workspace`, ensuring file
  operations stay within the session sandbox. [src/okcvm/registry.py#L1-L175](../src/okcvm/registry.py#L1-L175)
- Custom tools live in [`okcvm/tools`](../src/okcvm/tools). Highlights include
  deployment helpers, slide generation, shell access, and data ingestion stubs.
  Each tool adheres to the manifest schema and often wraps shared helpers from
  `okcvm.tools.base`. [src/okcvm/tools/deployment.py#L44-L320](../src/okcvm/tools/deployment.py#L44-L320)
  [src/okcvm/tools/slides.py#L1-L108](../src/okcvm/tools/slides.py#L1-L108)

## LangChain integration
- [`okcvm.llm.create_llm_chain`](../src/okcvm/llm.py) constructs a
  tool-calling `AgentExecutor` using the configured chat endpoint, propagating
  the streaming flag so server-sent events mirror provider capabilities.
  [src/okcvm/llm.py#L15-L75](../src/okcvm/llm.py#L15-L75)
- [`okcvm.vm.VirtualMachine`](../src/okcvm/vm.py) keeps structured history,
  adapts turns for LangChain, and records tool invocations for the UI while
  exposing direct tool calls. [src/okcvm/vm.py#L30-L245](../src/okcvm/vm.py#L30-L245)
- [`okcvm.session.SessionState`](../src/okcvm/session.py) enriches the VM output
  with previews, workspace snapshots, uploaded file manifests, and regenerated
  metadata for streaming handlers and synchronous responses alike.
  [src/okcvm/session.py#L30-L589](../src/okcvm/session.py#L30-L589)
- [`okcvm.streaming`](../src/okcvm/streaming.py) forwards LangChain callback
  events (tokens, tool starts/completions) through an SSE publisher consumed by
  the `/api/chat` streaming mode. [src/okcvm/streaming.py#L33-L165](../src/okcvm/streaming.py#L33-L165)

## FastAPI surface
- [`okcvm.api.main`](../src/okcvm/api/main.py) wires middleware, mounts the
  static frontend, and coordinates per-client `SessionState` instances via a
  thread-safe `SessionStore`. [src/okcvm/api/main.py#L30-L420](../src/okcvm/api/main.py#L30-L420)
- REST endpoints cover configuration CRUD, conversation persistence, workspace
  snapshot management, history inspection, and deployment asset serving while
  automatically injecting upload constraints. [src/okcvm/api/main.py#L423-L703](../src/okcvm/api/main.py#L423-L703)
- `/api/chat` supports both synchronous replies and streaming SSE sessions,
  relaying incremental tokens and tool telemetry via `LangChainStreamingHandler`.
  [src/okcvm/api/main.py#L705-L781](../src/okcvm/api/main.py#L705-L781)

## Conversation persistence
- [`okcvm.storage.conversations`](../src/okcvm/storage/conversations.py)
  provisions a SQLAlchemy model per client, persists full conversation graphs,
  and cleans up workspace artefacts when sessions are deleted.
  [src/okcvm/storage/conversations.py#L21-L318](../src/okcvm/storage/conversations.py#L21-L318)
- `get_conversation_store` caches the engine based on the active config and is
  reused by the conversation REST endpoints.
  [src/okcvm/storage/conversations.py#L321-L339](../src/okcvm/storage/conversations.py#L321-L339)

## Command line interface
- [`okcvm.server:cli`](../src/okcvm/server.py) is a Typer app that loads
  configuration, verifies workspace paths, and launches Uvicorn. Use
  `python -m okcvm.server --reload` for development or embed the CLI into
  supervisor scripts in production. [src/okcvm/server.py#L1-L88](../src/okcvm/server.py#L1-L88)
- The legacy entrypoint in [`main.py`](../main.py) still exposes Typer commands
  for compatibility; prefer the dedicated server module for new tooling.
  [main.py#L1-L175](../main.py#L1-L175)

## Testing
- `pytest` coverage spans configuration, FastAPI routes, virtual machine
  behaviour, workspace safety, streaming handlers, storage, and tool
  interactions. Start with [`tests/test_api_app.py`](../tests/test_api_app.py),
  [`tests/test_storage_conversations.py`](../tests/test_storage_conversations.py), and
  [`tests/test_workspace.py`](../tests/test_workspace.py) when debugging
  regressions. [tests/test_api_app.py#L1-L361](../tests/test_api_app.py#L1-L361)
  [tests/test_storage_conversations.py#L1-L132](../tests/test_storage_conversations.py#L1-L132)
  [tests/test_workspace.py#L1-L74](../tests/test_workspace.py#L1-L74)
- Add regression tests alongside new features; the suite runs quickly and is a
  prerequisite for merging into main.
