# Roadmap

This roadmap captures the state of the rebuilt OK Computer Virtual Machine (OKCVM)
stack and highlights the near-term direction for the project. It is meant to be a
living document—update it whenever major capabilities land or priorities shift.

## Recently Delivered

### Streaming-first runtime and operator feedback
- `/api/chat` now supports server-sent events with incremental tokens, tool status
  updates, and final payloads. The streaming pipeline relies on
  `LangChainStreamingHandler` and the frontend controller to surface progress.
  [src/okcvm/api/main.py#L705-L781](src/okcvm/api/main.py#L705-L781)
  [src/okcvm/streaming.py#L33-L165](src/okcvm/streaming.py#L33-L165)
  [frontend/app/streamingController.js#L1-L183](frontend/app/streamingController.js#L1-L183)
- Structured model logs and telemetry cards are persisted alongside each
  conversation so operators can audit tool traces without leaving the console.
  [src/okcvm/session.py#L277-L519](src/okcvm/session.py#L277-L519)
  [frontend/previews.js#L1-L200](frontend/previews.js#L1-L200)

### Persistent conversation store
- A SQLAlchemy-backed `ConversationStore` records conversations, workspace
  metadata, and deployment paths, enabling restore-on-reload behaviour and safe
  deletion of stale workspaces. [src/okcvm/storage/conversations.py#L81-L318](src/okcvm/storage/conversations.py#L81-L318)
- REST endpoints expose CRUD operations for the store while the frontend queues
  saves/deletes in the background to keep UI interactions snappy.
  [src/okcvm/api/main.py#L525-L580](src/okcvm/api/main.py#L525-L580)
  [frontend/conversationState.js#L612-L810](frontend/conversationState.js#L612-L810)

### Workspace uploads and prompt hints
- Operators can upload reference files directly through the console. The backend
  enforces per-session limits, stores files in the sandbox, and patches the system
  prompt with contextual summaries. [src/okcvm/api/main.py#L616-L703](src/okcvm/api/main.py#L616-L703)
  [src/okcvm/session.py#L96-L157](src/okcvm/session.py#L96-L157)
  [frontend/app/index.js#L171-L302](frontend/app/index.js#L171-L302)

### Frontend modularisation
- The console now delegates responsibilities to focused modules for history
  layout, streaming, uploads, configuration, and conversation persistence, making
  the UI easier to extend. [frontend/app/index.js#L1-L947](frontend/app/index.js#L1-L947)
  [frontend/conversationState.js#L1-L810](frontend/conversationState.js#L1-L810)
- Networking utilities manage `client_id` propagation, SSE parsing, and error
  handling so new features inherit consistent behaviour.
  [frontend/utils.js#L136-L288](frontend/utils.js#L136-L288)

### Quality and safety net
- New regression suites cover streaming callbacks, storage persistence, and
  workspace tooling in addition to the existing API and VM scenarios.
  [tests/test_streaming.py#L1-L110](tests/test_streaming.py#L1-L110)
  [tests/test_storage_conversations.py#L1-L132](tests/test_storage_conversations.py#L1-L132)
  [tests/test_workspace.py#L1-L74](tests/test_workspace.py#L1-L74)

## Active Initiatives

### Rich asset representations
We are expanding tool payload schemas with thumbnails, slide manifests, and audio
metadata so the control panel can render immersive previews without bespoke glue.
This work touches `SessionState.respond`, deployment helpers, and the preview
renderer. [src/okcvm/session.py#L277-L519](src/okcvm/session.py#L277-L519)
[frontend/previews.js#L200-L328](frontend/previews.js#L200-L328)

### Collaboration and retention controls
With the conversation store in place, the next milestone is cross-session
collaboration: durable retention policies, explicit sharing flows, and import/
export helpers for downstream tooling. [src/okcvm/storage/conversations.py#L81-L318](src/okcvm/storage/conversations.py#L81-L318)
[frontend/conversationState.js#L612-L810](frontend/conversationState.js#L612-L810)

### Packaging and distribution
Package the orchestrator (CLI, FastAPI app, and frontend) as container images and
Python wheels so operators can deploy OKCVM without cloning the repository.
[src/okcvm/server.py#L1-L88](src/okcvm/server.py#L1-L88)
[pyproject.toml#L1-L40](pyproject.toml#L1-L40)

## Future Exploration

- **Advanced browser automation** – Offer Playwright-backed browsing with resource
  limits while keeping the deterministic HTTP crawler for offline mode.
- **Media integrations** – Continue adding reference connectors for speech, sound
  effects, and ASR providers with consistent secret handling across toolchains.
- **Observability exports** – Push structured traces and workspace events into
  OpenTelemetry so operators can correlate OKCVM activity with external systems.
