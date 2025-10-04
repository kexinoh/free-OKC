# Architecture Overview

OKCVM repackages Moonshot's OK Computer agent into a self-hostable platform. The
system is composed of modular layers that keep the canonical specification,
Python orchestrator, FastAPI API, and static operator console loosely coupled.

## Subsystem map

1. **Specification bundle** – The upstream system prompt and tool manifest live
   in [`spec/system_prompt.md`](../spec/system_prompt.md) and [`spec/tools.json`](../spec/tools.json). `okcvm.spec` exposes dataclasses and
   helpers that parse these assets, providing typed accessors for downstream
   modules. [src/okcvm/spec.py#L1-L168](../src/okcvm/spec.py#L1-L168)
2. **Runtime core** – Modules under [`src/okcvm/`](../src/okcvm) handle
   configuration, logging, registry wiring, LangChain integration, workspace
   management, and session lifecycle. They are pure Python and power both the CLI
   and API surfaces. [src/okcvm/config.py#L25-L227](../src/okcvm/config.py#L25-L227) [src/okcvm/vm.py#L26-L178](../src/okcvm/vm.py#L26-L178)
3. **HTTP API** – [`okcvm.api.main`](../src/okcvm/api/main.py) wraps FastAPI,
   serves static assets, implements authentication-free REST endpoints, and keeps
   multi-client session state in-memory via `SessionStore`. [src/okcvm/api/main.py#L58-L309](../src/okcvm/api/main.py#L58-L309)
4. **Control panel frontend** – Static assets in [`frontend/`](../frontend)
   deliver the dashboard experience with persistent conversations, settings
   management, preview panes, and telemetry timelines. [frontend/index.html#L16-L220](../frontend/index.html#L16-L220) [frontend/app.js#L1-L851](../frontend/app.js#L1-L851)

## Request lifecycle

1. **Server startup** – The Typer CLI (`okcvm.server:cli`) loads layered
   configuration, validates the workspace directory, prepares logging, and spins
   up Uvicorn pointed at `okcvm.api.main:app`. [src/okcvm/server.py#L1-L88](../src/okcvm/server.py#L1-L88)
2. **Session boot** – On the first API call, `SessionStore` provisions a new
   `SessionState` which attaches a `WorkspaceManager`, loads the canonical prompt,
   and instantiates a `VirtualMachine` bound to the default tool registry. [src/okcvm/api/main.py#L58-L209](../src/okcvm/api/main.py#L58-L209) [src/okcvm/session.py#L22-L90](../src/okcvm/session.py#L22-L90)
3. **Chat execution** – The virtual machine adapts chat history into LangChain
   message objects, invokes the configured model, records tool calls, and returns
   a structured payload consumed by the frontend. [src/okcvm/vm.py#L58-L178](../src/okcvm/vm.py#L58-L178)
4. **Workspace snapshotting** – After each response, the workspace state takes a
   Git snapshot and exposes metadata (latest commit, snapshot list, workspace
   mount paths) via the session object so the UI can render the session tree. [src/okcvm/session.py#L94-L207](../src/okcvm/session.py#L94-L207) [src/okcvm/workspace.py#L32-L211](../src/okcvm/workspace.py#L32-L211)
5. **Frontend rendering** – The browser client fetches configuration and session
   info, renders conversation threads, writes HTML previews into an iframe, and
   streams telemetry into the model log timeline. [frontend/app.js#L360-L851](../frontend/app.js#L360-L851)

## Data boundaries and storage

- **Configuration** – In-memory dataclasses represent chat/media endpoints and
  can be mutated via CLI, YAML, environment variables, or `/api/config`
  requests. [src/okcvm/config.py#L25-L227](../src/okcvm/config.py#L25-L227) [src/okcvm/api/main.py#L210-L256](../src/okcvm/api/main.py#L210-L256)
- **Session history** – Stored in-process within `VirtualMachine`, including
  references to tool inputs/outputs and workspace snapshots for branchable
  timelines. [src/okcvm/vm.py#L118-L178](../src/okcvm/vm.py#L118-L178)
- **Workspace** – Each session receives a namespaced directory tree, optionally
  Git-backed, to isolate file operations and persist artefacts between requests. [src/okcvm/workspace.py#L32-L211](../src/okcvm/workspace.py#L32-L211)
- **Frontend cache** – `localStorage` holds conversation metadata for quick
  restoration after reloads; the backend remains stateless beyond workspace
  directories. [frontend/app.js#L1-L360](../frontend/app.js#L1-L360)

## Testing and observability

- `pytest` covers API routes, workspace guarantees, and VM behaviour. The suite
  lives under [`tests/`](../tests) with fixtures in `conftest.py`. [tests/test_api_app.py#L1-L145](../tests/test_api_app.py#L1-L145) [tests/test_workspace.py#L1-L24](../tests/test_workspace.py#L1-L24)
- Structured logs are emitted via `RequestLoggingMiddleware` and the shared
  logging utilities, enabling trace correlation between API calls and agent
  activity. [src/okcvm/api/main.py#L30-L87](../src/okcvm/api/main.py#L30-L87) [src/okcvm/logging_utils.py#L1-L115](../src/okcvm/logging_utils.py#L1-L115)

This layered architecture keeps the project modular: the runtime core can power
other interfaces, and the frontend can evolve independently while consuming the
stable API surface.
