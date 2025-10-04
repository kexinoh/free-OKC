# Developer Documentation

Welcome to the OK Computer Virtual Machine (OKCVM) knowledge base. This folder
describes how the orchestrator, API, workspace sandbox, and operator console work
together. If you are onboarding, start here before diving into the source tree.

## Document map

| File | Purpose |
| ---- | ------- |
| [`architecture.md`](./architecture.md) | System decomposition, runtime flow, and integration points between backend, frontend, and tooling. |
| [`backend.md`](./backend.md) | Detailed explanation of configuration, LangChain orchestration, FastAPI routes, and supporting utilities. |
| [`frontend.md`](./frontend.md) | Walkthrough of the static control panel, state management, accessibility patterns, and preview rendering. |
| [`workspace.md`](./workspace.md) | Deep dive into per-session sandboxes, Git snapshots, path resolution, and tool injection. |
| [`session_tree.md`](./session_tree.md) | Conceptual model for how chat history, workspace commits, deployments, and artefacts form a navigable tree. |

## How to use this folder

- **Keep docs and code in sync.** Whenever you modify core runtime logic, update
the corresponding section. The tables above should always reflect the actual
responsibilities of each module.【F:docs/backend.md†L1-L124】
- **Link to source.** Inline citations (e.g. `【F:src/...】`) reference canonical
implementations so future contributors can audit behaviour quickly.
- **Prefer English.** All technical documentation is maintained in English to
serve the global engineering team. Localised product copy belongs in the
frontend assets or runtime constants.【F:src/okcvm/constants.py†L1-L120】

## Editing checklist

1. Verify the README and roadmap capture the newly delivered capability.
2. Update architecture/backend docs when introducing new services, background
   jobs, or configuration structures.
3. Extend the workspace and session tree guides whenever tools rely on new
   directory layouts or metadata conventions.
4. Run `pytest` after major changes and record additional learnings in the
docs if a regression revealed missing context.【F:tests/test_api_app.py†L1-L145】

Treat this directory as part of the codebase—pull requests without matching
documentation updates should be rare exceptions.
