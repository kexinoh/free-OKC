# Architecture Overview

OKCVM repackages Moonshot's OK Computer agent into a self-hostable platform. The
system is composed of modular layers that keep the canonical specification,
Python orchestrator, FastAPI API, and static operator console loosely coupled.

## Subsystem map

1. **Specification bundle** – The upstream system prompt and tool manifest live
   in [`spec/system_prompt.md`](../spec/system_prompt.md) and [`spec/tools.json`](../spec/tools.json).
   `okcvm.spec` exposes data classes and helpers that parse these assets,
   providing typed accessors for downstream modules.
   [src/okcvm/spec.py#L1-L168](../src/okcvm/spec.py#L1-L168)
2. **Runtime core** – Modules under [`src/okcvm/`](../src/okcvm) handle
   configuration, logging, tool registration, LangChain orchestration, streaming
   callbacks, workspace management, and session lifecycle for both CLI and API
   surfaces. [src/okcvm/config.py#L49-L374](../src/okcvm/config.py#L49-L374)
   [src/okcvm/vm.py#L30-L245](../src/okcvm/vm.py#L30-L245)
   [src/okcvm/streaming.py#L33-L165](../src/okcvm/streaming.py#L33-L165)
3. **HTTP API** – [`okcvm.api.main`](../src/okcvm/api/main.py) wraps FastAPI,
   serves static assets, exposes REST and streaming endpoints, manages the
   conversation store, and keeps multi-client session state in-memory via
   `SessionStore`. [src/okcvm/api/main.py#L30-L781](../src/okcvm/api/main.py#L30-L781)
4. **Control panel frontend** – Static assets in [`frontend/`](../frontend)
   deliver the operator console with persistent conversations, upload workflows,
   streaming transcripts, preview panes, and telemetry timelines.
   [frontend/index.html#L16-L220](../frontend/index.html#L16-L220)
   [frontend/app/index.js#L1-L360](../frontend/app/index.js#L1-L360)
   [frontend/app/streamingController.js#L1-L183](../frontend/app/streamingController.js#L1-L183)
   [frontend/conversationState.js#L1-L810](../frontend/conversationState.js#L1-L810)

## Request lifecycle

1. **Server startup** – The Typer CLI (`okcvm.server:cli`) loads layered
   configuration, validates the workspace directory, prepares logging, and spins
   up Uvicorn pointed at `okcvm.api.main:app`. [src/okcvm/server.py#L1-L88](../src/okcvm/server.py#L1-L88)
2. **Session boot** – On the first API call, `SessionStore` provisions a
   `SessionState` keyed by the caller’s `client_id`, attaches a `WorkspaceManager`,
   patches the canonical prompt with upload hints, and instantiates a
   `VirtualMachine` bound to the registered tools.
   [src/okcvm/api/main.py#L30-L420](../src/okcvm/api/main.py#L30-L420)
   [src/okcvm/session.py#L30-L153](../src/okcvm/session.py#L30-L153)
3. **Chat execution** – The virtual machine adapts history into LangChain
   messages, streams tokens and tool telemetry via SSE when requested, records
   tool calls, and returns enriched previews, artefacts, uploads, and workspace
   state for the frontend. [src/okcvm/vm.py#L58-L245](../src/okcvm/vm.py#L58-L245)
   [src/okcvm/session.py#L277-L519](../src/okcvm/session.py#L277-L519)
   [src/okcvm/streaming.py#L33-L165](../src/okcvm/streaming.py#L33-L165)
4. **Workspace snapshotting** – After each response, the workspace state takes a
   Git snapshot and exposes metadata (latest commit, snapshot list, mount paths)
   so the UI and conversation store can render the session tree.
   [src/okcvm/session.py#L277-L588](../src/okcvm/session.py#L277-L588)
   [src/okcvm/workspace.py#L112-L332](../src/okcvm/workspace.py#L112-L332)
5. **Frontend rendering** – The browser client syncs configuration,
   conversations, uploads, and workspace metadata; renders branches; streams
   incremental tokens; and updates previews and telemetry panes.
   [frontend/app/index.js#L270-L360](../frontend/app/index.js#L270-L360)
   [frontend/conversationState.js#L612-L810](../frontend/conversationState.js#L612-L810)
   [frontend/app/streamingController.js#L118-L182](../frontend/app/streamingController.js#L118-L182)

## Data boundaries and storage

- **Configuration** – In-memory dataclasses represent chat/media endpoints,
  conversation-store settings, and workspace roots. They can be mutated via CLI,
  YAML, environment variables, or `/api/config` requests.
  [src/okcvm/config.py#L49-L374](../src/okcvm/config.py#L49-L374)
  [src/okcvm/api/main.py#L423-L523](../src/okcvm/api/main.py#L423-L523)
- **Session history** – Stored in-process within `VirtualMachine`, including
  tool traces, uploads, and snapshot identifiers for branchable timelines.
  [src/okcvm/vm.py#L118-L245](../src/okcvm/vm.py#L118-L245)
- **Workspace** – Each session receives a namespaced directory tree, optionally
  Git-backed, to isolate file operations, uploaded assets, and tool outputs.
  [src/okcvm/workspace.py#L120-L332](../src/okcvm/workspace.py#L120-L332)
- **Conversation store** – Persisted conversations live in the SQL-backed store
  so the UI can restore message graphs, previews, and workspace metadata across
  reloads. [src/okcvm/storage/conversations.py#L81-L318](../src/okcvm/storage/conversations.py#L81-L318)
- **Frontend cache** – `localStorage` holds client identifiers while the REST
  API exposes full conversation data. Upload manifests and previews travel with
  each response. [frontend/utils.js#L1-L300](../frontend/utils.js#L1-L300)
  [frontend/conversationState.js#L612-L810](../frontend/conversationState.js#L612-L810)

## Testing and observability

- `pytest` covers API routes, workspace guarantees, streaming handlers, storage,
  and VM behaviour. The suite lives under [`tests/`](../tests) with fixtures in
  `conftest.py`. [tests/test_api_app.py#L1-L361](../tests/test_api_app.py#L1-L361)
  [tests/test_streaming.py#L1-L110](../tests/test_streaming.py#L1-L110)
  [tests/test_storage_conversations.py#L1-L132](../tests/test_storage_conversations.py#L1-L132)
- Structured logs are emitted via `RequestLoggingMiddleware` and the shared
  logging utilities, enabling trace correlation between API calls and agent
  activity. [src/okcvm/api/main.py#L105-L138](../src/okcvm/api/main.py#L105-L138)
  [src/okcvm/logging_utils.py#L1-L146](../src/okcvm/logging_utils.py#L1-L146)

This layered architecture keeps the project modular: the runtime core can power
other interfaces, and the frontend can evolve independently while consuming the
stable API surface.
