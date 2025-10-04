# Roadmap

This roadmap captures the state of the rebuilt OK Computer Virtual Machine (OKCVM)
stack and highlights the near-term direction for the project. It is meant to be a
living document—update it whenever major capabilities land or priorities shift.

## Recently Delivered

### Production-ready runtime and observability
- FastAPI now powers the public surface, complete with CORS support, structured
  request logging, and static hosting for the operator console so deployments are
  inspectable with minimal configuration.【F:src/okcvm/api/main.py†L30-L209】
- The logging stack wires Rich console handlers and rotating file output, making
  API and agent traces actionable during incident response.【F:src/okcvm/logging_utils.py†L1-L115】

### Virtual machine orchestration and tooling
- The LangChain-backed `VirtualMachine` streams conversation history into a tool
  aware agent executor and records the trace required by the UI’s model log.【F:src/okcvm/vm.py†L26-L178】
- `ToolRegistry` loads the canonical tool manifest, injects workspace-aware
  helpers, and exposes LangChain-compatible wrappers, closing the loop between
  packaged specifications and runtime behaviour.【F:src/okcvm/registry.py†L1-L200】

### Session isolation and workspace lifecycle
- Every client receives an isolated `WorkspaceManager` that rewrites prompt
  mounts, restricts filesystem access, and snapshots state through Git-backed
  commits for time-travel debugging.【F:src/okcvm/session.py†L22-L207】【F:src/okcvm/workspace.py†L32-L281】
- Snapshot creation, listing, and restoration are exposed as first-class API
  endpoints so the frontend can drive the session tree UI without bespoke glue
  code.【F:src/okcvm/api/main.py†L210-L309】

### Operator experience and automation
- A Typer CLI now launches the FastAPI server, validates configuration, and
  resolves workspace directories before Uvicorn starts, smoothing local and
  production workflows.【F:src/okcvm/server.py†L1-L88】
- Configuration dataclasses centralise chat and media credentials, providing
  atomic updates from YAML, environment variables, or API requests.【F:src/okcvm/config.py†L25-L227】

### Control panel and presentation layer
- The static frontend introduces persistent conversations, configuration
  management, live previews for HTML/PPT assets, and a model telemetry timeline
  that mirrors the VM trace.【F:frontend/index.html†L16-L220】【F:frontend/app.js†L1-L851】
- Deployment assets are now served directly from per-session directories, giving
  the preview UI predictable URLs for websites and other artefacts.【F:src/okcvm/api/main.py†L146-L209】

### Quality and safety net
- The pytest suite exercises API routes, workspace guarantees, and LangChain
  integration so regressions surface quickly during CI.【F:tests/test_api_app.py†L1-L145】【F:tests/test_workspace.py†L1-L24】

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

### Multi-session coordination
The API already accepts caller-provided client IDs. We plan to extend this with
persistent storage and eviction policies so teams can resume workspaces across
restarts, expire dormant sessions, and safely share deployments between
operators.【F:src/okcvm/api/main.py†L58-L145】

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
