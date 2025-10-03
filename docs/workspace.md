# Session workspace ("虚拟空间")

Many OK Computer tools expect a sandboxed file system. OKCVM recreates that
experience with a per-session "virtual space" managed by
[`okcvm.workspace.WorkspaceManager`](../src/okcvm/workspace.py).

## How the workspace is created
- The manager generates a random mount path like `/mnt/okcvm-12ab34cd/` and maps
  it to a private directory under the system temp folder. Both the public mount
  and the internal output directory are tracked in a `WorkspacePaths` dataclass.
  【F:src/okcvm/workspace.py†L11-L49】
- `SessionState` injects the workspace into the default tool registry so every
  tool that declares `requires_workspace` is automatically scoped to the session.
  【F:src/okcvm/session.py†L29-L36】

## Path resolution rules
- `WorkspaceManager.resolve` accepts user-provided paths, normalises them, and
  anchors them inside the internal root. Absolute paths outside the mount are
  re-based under the session to prevent leakage, and attempts to escape the root
  raise `WorkspaceError`. 【F:src/okcvm/workspace.py†L51-L97】
- Regression tests confirm both absolute (`/tmp/...`) and relative
  (`project/readme.md`) paths resolve to the session directory. 【F:tests/test_workspace.py†L1-L24】

## Prompt adaptation
- The manager rewrites legacy instructions in the upstream system prompt so that
  agents receive the correct mount/output paths for the current session. This is
  why the UI and CLI display randomised workspace IDs in session metadata.
  【F:src/okcvm/workspace.py†L99-L108】【F:src/okcvm/vm.py†L163-L176】

## Git-backed state management
- Workspaces now bootstrap a lightweight Git repository through
  `GitWorkspaceState`, enabling snapshot/restore without leaking outside the
  sandbox. The manager falls back gracefully when Git is unavailable.
  【F:src/okcvm/workspace.py†L15-L167】
- `SessionState` publishes snapshot metadata with every response and exposes
  helpers for manual snapshots or rollbacks, making "虚拟空间" time travelable in
  multi-turn sessions. 【F:src/okcvm/session.py†L25-L164】
- FastAPI endpoints surface the snapshot list, creation, and restore actions for
  the frontend; end-to-end tests cover both the backend API and Git round trip.
  【F:src/okcvm/api/main.py†L17-L205】【F:tests/test_api_app.py†L1-L142】【F:tests/test_workspace.py†L1-L62】

## User-facing documentation
- Both READMEs explain the virtual workspace contract, highlighting that file
  tools stay within the sandbox and that crossing the boundary yields an error.
  Share this section with contributors who are confused about "虚拟空间" paths.
  【F:README.md†L156-L156】【F:README_ZH.md†L148-L148】
