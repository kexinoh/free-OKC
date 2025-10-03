# Developer Documentation

Welcome to the OKCVM knowledge base. This directory collects concise notes
about the major subsystems so newcomers can understand how the pieces fit
together before diving into the source code.

## Document map

| File | Purpose |
| ---- | ------- |
| [`architecture.md`](./architecture.md) | High-level system overview and data flow. |
| [`backend.md`](./backend.md) | Detailed notes on the Python orchestrator, configuration, and CLI. |
| [`frontend.md`](./frontend.md) | Summary of the bundled control panel and its behaviour. |
| [`workspace.md`](./workspace.md) | Deep dive into the per-session sandbox, path resolution, and snapshotting. |
| [`session_tree.md`](./session_tree.md) | Explains how conversation history, workspace snapshots, and tool artefacts form the session tree. |

We keep these files short and link back to the canonical implementation files
so that updates stay in sync with the codebase. When you add a new capability,
please update or extend the relevant document.
