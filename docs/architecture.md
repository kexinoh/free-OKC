# Architecture Overview

This project re-packages Moonshot's OK Computer agent into a self-hostable
stack. The repository is organised into four primary layers:

1. **Specification bundle** – The upstream system prompt and tool manifest live
   in [`spec/system_prompt.md`](../spec/system_prompt.md) and
   [`spec/tools.json`](../spec/tools.json). `okcvm.spec` exposes helpers for
   reading these assets and returning structured dataclasses that other modules
   can consume. 【F:src/okcvm/spec.py†L1-L168】
2. **Python orchestrator** – Core runtime modules under `src/okcvm/` implement
   configuration, tool registration, LangChain integration, and session
   lifecycle management. These pieces power both the CLI (`main.py`) and the
   FastAPI surface. 【F:src/okcvm/config.py†L25-L227】【F:src/okcvm/registry.py†L1-L200】【F:src/okcvm/vm.py†L20-L178】
3. **HTTP API** – [`src/okcvm/api/main.py`](../src/okcvm/api/main.py) instantiates
   a FastAPI application, wires middleware, serves the static frontend, and
   exposes the `/api/*` endpoints used by the UI. 【F:src/okcvm/api/main.py†L1-L145】
4. **Control panel frontend** – Static assets in [`frontend/`](../frontend)
   provide a lightweight dashboard for configuring endpoints, running chats, and
   reviewing execution traces. 【F:frontend/index.html†L1-L210】【F:frontend/app.js†L1-L360】

## Runtime flow

1. When the CLI (`main.py`) launches the server, it ensures dependencies are
   available, loads layered configuration (`config.yaml` + environment), and
   starts Uvicorn against the FastAPI app. 【F:main.py†L1-L120】
2. `SessionState` bootstraps a `WorkspaceManager`, loads the canonical system
   prompt, and constructs a `VirtualMachine` bound to the default tool registry.
   【F:src/okcvm/session.py†L18-L44】
3. The virtual machine converts chat history into LangChain messages, invokes the
   configured LLM, and records any tool calls or outputs. Results are mapped into
   the UI-friendly payload returned by `SessionState.respond`. 【F:src/okcvm/vm.py†L73-L196】【F:src/okcvm/session.py†L45-L103】
4. Frontend requests hit the FastAPI endpoints, which stream back configuration
   descriptions, session summaries, or chat responses. The UI renders previews,
   history, and meta telemetry based on the JSON payloads. 【F:src/okcvm/api/main.py†L74-L144】【F:frontend/app.js†L240-L620】

## Testing strategy

A comprehensive `pytest` suite under [`tests/`](../tests) keeps the runtime
stable. API, VM, registry, and workspace behaviour all have dedicated coverage,
with fixtures defined in [`tests/conftest.py`](../tests/conftest.py). 【F:tests/test_api_app.py†L1-L120】【F:tests/test_vm.py†L1-L14】【F:tests/test_workspace.py†L1-L24】
