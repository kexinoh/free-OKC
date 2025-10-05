# Workspace

OKCVM creates an isolated workspace per session so file-based tools operate inside
sandboxed directories. The workspace manager also supports Git snapshots, ensuring
operators can roll back to previous states with confidence.

## Directory structure and initialisation

1. **Mount points.** `WorkspaceManager` generates a random mount name (e.g.
   `/mnt/okcvm-12ab34cd/`) and prepares an internal root with `mnt/`, `output/`,
   and `tmp/` subdirectories for user-visible files, tool outputs, and temporary
   artefacts. [src/okcvm/workspace.py#L225-L332](../src/okcvm/workspace.py#L225-L332)
2. **Path dataclass.** `WorkspacePaths` stores the session ID, public mount paths,
   and absolute filesystem locations so APIs and logs can describe artefacts
   without leaking internal directory layouts.
   [src/okcvm/workspace.py#L212-L224](../src/okcvm/workspace.py#L212-L224)
3. **Cleanup.** `WorkspaceManager.cleanup()` safely removes the internal root when
   sessions reset, ignoring missing directories to keep operations idempotent.
   [src/okcvm/workspace.py#L333-L370](../src/okcvm/workspace.py#L333-L370)

## Path resolution and sandboxing

- All user-supplied paths flow through `WorkspaceManager.resolve()`, which
  normalises separators, rewrites absolute paths into the session root, and
  prevents escapes above the workspace directory by raising `WorkspaceError`.
  [src/okcvm/workspace.py#L293-L321](../src/okcvm/workspace.py#L293-L321)
- `adapt_prompt()` replaces legacy mount references (e.g. `/mnt/okcomputer/`) in
  the system prompt so the agent always receives the current session-specific
  paths. [src/okcvm/workspace.py#L323-L331](../src/okcvm/workspace.py#L323-L331)

## Git-backed snapshots

- `GitWorkspaceState` initialises a repository inside the workspace, sets isolated
  Git environment variables, and provides `snapshot()` / `restore()` helpers.
  Environments without Git fall back to a null implementation that disables
  snapshots but keeps the sandbox usable.
  [src/okcvm/workspace.py#L47-L207](../src/okcvm/workspace.py#L47-L207)
- Snapshots stage all files, commit with a label derived from the conversation,
  and return metadata (hash, message, timestamp) for the session tree.
  [src/okcvm/workspace.py#L119-L158](../src/okcvm/workspace.py#L119-L158)
- Restoring a snapshot performs `git reset --hard`, cleans untracked files, and
  raises `WorkspaceStateError` when an unknown hash is provided so callers can
  surface actionable errors. [src/okcvm/workspace.py#L160-L172](../src/okcvm/workspace.py#L160-L172)

## Session lifecycle integration

1. **Creation.** `SessionState._initialise_vm()` resolves workspace settings from
   the global config, instantiates `WorkspaceManager`, injects it into the tool
   registry, and prepares the virtual machine for the client.
   [src/okcvm/session.py#L30-L153](../src/okcvm/session.py#L30-L153)
2. **Response handling.** `SessionState.respond()` generates snapshot labels from
   the latest user message, captures the workspace state, and includes summary
   metadata in the API response for frontend consumption.
   [src/okcvm/session.py#L277-L519](../src/okcvm/session.py#L277-L519)
3. **Reset.** `SessionState.delete_history()` and `SessionState.reset()` call
   `cleanup()` on the workspace, ensuring stale files never leak into new
   sessions. [src/okcvm/session.py#L555-L569](../src/okcvm/session.py#L555-L569)

## API integration

- FastAPI routes list, create, and restore snapshots under `/api/session/workspace/*`,
  wrapping workspace errors into HTTP 400 responses for clarity.
  [src/okcvm/api/main.py#L797-L845](../src/okcvm/api/main.py#L797-L845)
- Tools that require filesystem access receive the workspace manager via dependency
  injection, guaranteeing their reads/writes stay inside the sandbox and are
  tracked by subsequent snapshots.
  [src/okcvm/registry.py#L1-L175](../src/okcvm/registry.py#L1-L175)
  [src/okcvm/tools/deployment.py#L118-L320](../src/okcvm/tools/deployment.py#L118-L320)

Treat the workspace as the source of truth for artefacts—tests, deployments, and
previews all rely on its consistency and isolation guarantees.
