# Roadmap

This roadmap captures the state of the rebuilt OK Computer Virtual Machine (OKCVM)
stack and highlights the near-term direction for the project. It is meant to be a
living document—update it whenever major capabilities land or priorities shift.

## Recently Delivered

### Production-ready runtime and observability
- FastAPI now powers the public surface, complete with CORS support, structured
  request logging, and static hosting for the operator console so deployments are
  inspectable with minimal configuration. [src/okcvm/api/main.py#L30-L209](src/okcvm/api/main.py#L30-L209)
- The logging stack wires Rich console handlers and rotating file output, making
  API and agent traces actionable during incident response. [src/okcvm/logging_utils.py#L1-L115](src/okcvm/logging_utils.py#L1-L115)

### Virtual machine orchestration and tooling
- The LangChain-backed `VirtualMachine` streams conversation history into a tool
  aware agent executor and records the trace required by the UI’s model log. [src/okcvm/vm.py#L26-L178](src/okcvm/vm.py#L26-L178)
- `ToolRegistry` loads the canonical tool manifest, injects workspace-aware
  helpers, and exposes LangChain-compatible wrappers, closing the loop between
  packaged specifications and runtime behaviour. [src/okcvm/registry.py#L1-L200](src/okcvm/registry.py#L1-L200)

### Session isolation and workspace lifecycle
- Every client receives an isolated `WorkspaceManager` that rewrites prompt
  mounts, restricts filesystem access, and snapshots state through Git-backed
  commits for time-travel debugging. [src/okcvm/session.py#L22-L207](src/okcvm/session.py#L22-L207) [src/okcvm/workspace.py#L32-L281](src/okcvm/workspace.py#L32-L281)
- Snapshot creation, listing, and restoration are exposed as first-class API
  endpoints so the frontend can drive the session tree UI without bespoke glue
  code. [src/okcvm/api/main.py#L210-L309](src/okcvm/api/main.py#L210-L309)
- Artifact metadata, deployment URLs, and slide previews are normalised inside
  `SessionState.respond`, ensuring previews include a `client_id` and stay
  deduplicated across tool payloads. [src/okcvm/session.py#L76-L279](src/okcvm/session.py#L76-L279)

### Client-scoped orchestration
- `SessionStore` provisions sessions per `client_id`, while `AppState` exposes
  the active VM for debugging and tests without sacrificing encapsulation.
  Cookies, headers, and query parameters all map to the same identifier so tabs
  from the same browser stay synced. [src/okcvm/api/main.py#L90-L206](src/okcvm/api/main.py#L90-L206)
- The frontend propagates the identifier automatically when calling the API or
  loading deployment assets, removing the need for manual wiring when embedding
  the console. [frontend/utils.js#L1-L120](frontend/utils.js#L1-L120)

### Operator experience and automation
- A Typer CLI now launches the FastAPI server, validates configuration, and
  resolves workspace directories before Uvicorn starts, smoothing local and
  production workflows. [src/okcvm/server.py#L1-L88](src/okcvm/server.py#L1-L88)
- Configuration dataclasses centralise chat and media credentials, providing
  atomic updates from YAML, environment variables, or API requests. [src/okcvm/config.py#L25-L227](src/okcvm/config.py#L25-L227)

### Control panel and presentation layer
- The static frontend now splits responsibilities across focused modules for
  configuration, conversation state, previews, and utilities while retaining the
  accessible layout defined in `index.html`. [frontend/index.html#L16-L220](frontend/index.html#L16-L220) [frontend/app.js#L1-L200](frontend/app.js#L1-L200) [frontend/conversationState.js#L1-L240](frontend/conversationState.js#L1-L240)
- Deployment assets are served directly from per-session directories, and
  preview frames consume the enriched metadata produced by the backend to keep
  artefacts, slides, and web content in sync. [src/okcvm/api/main.py#L146-L209](src/okcvm/api/main.py#L146-L209) [frontend/previews.js#L1-L200](frontend/previews.js#L1-L200)

### Quality and safety net
- The pytest suite exercises API routes, workspace guarantees, and LangChain
  integration so regressions surface quickly during CI. [tests/test_api_app.py#L1-L145](tests/test_api_app.py#L1-L145) [tests/test_workspace.py#L1-L24](tests/test_workspace.py#L1-L24)

## Active Initiatives

### Streaming and responsiveness
We are investigating LangChain callback handlers to surface partial assistant
responses, tool progress, and heartbeat updates to the frontend without waiting
for the full completion. This requires expanding `VirtualMachine.respond` to
support incremental yield semantics and adapting the UI to consume a stream.

### Rich asset representations
Tool outputs currently ship as raw HTML snippets or file paths. The next sprint
focuses on producing structured metadata (thumbnails, slide manifests, audio
waveforms) so the control panel can render immersive previews while remaining
agnostic of tool specifics.

### Session persistence and collaboration
With per-client isolation in place, the next milestone is durable storage and
retention policies so teams can resume workspaces across restarts, expire
dormant sessions, and intentionally share deployments between operators without
manual intervention.

## Future Exploration

- **Packaging and distribution** – Ship container images and Python wheels that
  bundle the CLI, FastAPI app, and frontend for zero-effort installation.
- **Advanced browser automation** – Offer Playwright-backed browsing with
  resource limits while keeping the deterministic HTTP crawler for offline mode.
- **Media integrations** – Continue adding reference connectors for speech,
  sound effects, and ASR providers with consistent secret handling across
  toolchains.
- **Observability exports** – Push structured traces and workspace events into
  OpenTelemetry so operators can correlate OKCVM activity with external systems.
