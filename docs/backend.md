# Backend internals

The backend is a Python orchestrator that bundles the upstream OK Computer
prompt, tool catalogue, and a LangChain-powered runtime. This note summarises
the key modules and how they interact.

## Configuration and global state
- [`okcvm.config`](../src/okcvm/config.py) defines the `ModelEndpointConfig`,
  `MediaConfig`, and `Config` dataclasses plus helpers for loading values from
  environment variables or YAML. It exposes thread-safe `configure`,
  `get_config`, and `reset_config` functions so the FastAPI layer can mutate
  credentials safely. 【F:src/okcvm/config.py†L25-L227】
- `load_config_from_yaml` accepts a path and applies the parsed chat/media
  endpoints, honouring `*_API_KEY` environment overrides for secrets. This is
  what the CLI uses when bootstrapping the server. 【F:src/okcvm/config.py†L177-L227】

## Tool registry and LLM integration
- [`okcvm.registry.ToolRegistry`](../src/okcvm/registry.py) loads the packaged
  tool manifest, registers concrete implementations, and injects a
  `WorkspaceManager` when a tool advertises `requires_workspace`. It can also
  emit LangChain-compatible tool wrappers for agent execution. 【F:src/okcvm/registry.py†L1-L200】
- [`okcvm.llm.create_llm_chain`](../src/okcvm/llm.py) reads the active chat model
  configuration, builds a `ChatOpenAI` client, binds registered tools, and
  returns a LangChain agent executor capable of handling tool-calling loops.
  【F:src/okcvm/llm.py†L13-L57】
- [`okcvm.vm.VirtualMachine`](../src/okcvm/vm.py) lazily initialises the LangChain
  agent, adapts chat history into LangChain message objects, tracks tool call
  results, and exposes helpers for describing or replaying history. 【F:src/okcvm/vm.py†L20-L178】
- [`okcvm.session.SessionState`](../src/okcvm/session.py) glues everything
  together: it provisions a fresh `WorkspaceManager`, instantiates the registry
  and VM, decorates responses with previews/meta, and surfaces boot and chat
  operations to the API. 【F:src/okcvm/session.py†L18-L128】

## API surface
- [`src/okcvm/api/main.py`](../src/okcvm/api/main.py) constructs the FastAPI app,
  wires request logging middleware, mounts the static frontend under `/ui`, and
  implements `/api/config`, `/api/session/*`, and `/api/chat` endpoints. The
  routes use `SessionState` to answer chat requests and expose system
  descriptions. 【F:src/okcvm/api/main.py†L1-L145】

## Command line interface
- [`main.py`](../main.py) wraps Typer to expose commands for running the server,
  validating configuration, and listing tools. It verifies dependencies, loads
  `.env`/`config.yaml`, then launches Uvicorn against `okcvm.api.main:app`.
  【F:main.py†L1-L120】【F:main.py†L120-L175】

## Testing
- Pytest coverage exercises configuration, API routes, LangChain wiring, and the
  workspace sandbox. Start with [`tests/test_api_app.py`](../tests/test_api_app.py)
  for FastAPI endpoints, [`tests/test_vm.py`](../tests/test_vm.py) for VM
  behaviour, and [`tests/test_workspace.py`](../tests/test_workspace.py) for path
  resolution guarantees. 【F:tests/test_api_app.py†L1-L145】【F:tests/test_vm.py†L1-L14】【F:tests/test_workspace.py†L1-L24】
