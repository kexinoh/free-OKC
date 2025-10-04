# Session tree

The session tree links conversation history, workspace snapshots, deployments, and
slide artefacts into a navigable structure. It allows operators to branch, restore,
and audit multi-turn projects without losing context.

## Node types

1. **Root node – Session metadata.** `SessionState.boot()` seeds the tree with the
   welcome message, workspace descriptors, and virtual machine summary. Resetting
   history or the workspace clears this root and triggers a fresh initialisation
   on the next request. [src/okcvm/session.py#L22-L207](../src/okcvm/session.py#L22-L207)
2. **Conversation nodes – Message history.** `VirtualMachine.record_history_entry`
   generates deterministic IDs (e.g. `okcvm-12ab34cd-0001`) for each exchange,
   storing message content, tool traces, and metadata. `/api/session/history/{id}`
   returns any node so the frontend can render branches and tool details. [src/okcvm/vm.py#L58-L178](../src/okcvm/vm.py#L58-L178) [src/okcvm/api/main.py#L257-L309](../src/okcvm/api/main.py#L257-L309)
3. **Artefact nodes – Tool outputs.** When the agent calls a tool, the input,
   output, and status are persisted alongside the message so deployments, slide
   decks, and files appear as children in the tree for later inspection. [src/okcvm/vm.py#L118-L178](../src/okcvm/vm.py#L118-L178)

## Snapshot workflow

- `SessionState.respond()` labels each snapshot using the user prompt, then calls
  `workspace.state.snapshot()` to commit filesystem changes. The response embeds
  the commit hash and recent history so the UI can annotate the timeline. [src/okcvm/session.py#L94-L150](../src/okcvm/session.py#L94-L150) [src/okcvm/workspace.py#L120-L162](../src/okcvm/workspace.py#L120-L162)
- `SessionState.restore_workspace()` applies `git reset --hard` to a requested
  hash and refreshes the workspace metadata returned to the client. Errors bubble
  up as `WorkspaceStateError`, which the API converts to HTTP 400 responses. [src/okcvm/session.py#L180-L207](../src/okcvm/session.py#L180-L207) [src/okcvm/workspace.py#L156-L167](../src/okcvm/workspace.py#L156-L167) [src/okcvm/api/main.py#L283-L309](../src/okcvm/api/main.py#L283-L309)

## Linking workspaces and history

- Each history node references the active workspace ID and mount paths via
  `VirtualMachine.describe()`. `/api/session/info` exposes these values so the UI
  can show the correct sandbox when operators jump between branches. [src/okcvm/vm.py#L158-L207](../src/okcvm/vm.py#L158-L207) [src/okcvm/api/main.py#L233-L256](../src/okcvm/api/main.py#L233-L256)
- Tool implementations receive the injected `WorkspaceManager`, write outputs to
  namespaced directories (e.g. `deployments/`, `generated_slides/`), and include
  session IDs in their metadata for cross-branch auditing. [src/okcvm/tools/deployment.py#L70-L208](../src/okcvm/tools/deployment.py#L70-L208) [src/okcvm/tools/slides.py#L12-L78](../src/okcvm/tools/slides.py#L12-L78)

## Reset and cleanup

1. **Selective rollback.** Calling `/api/session/workspace/restore` rewinds the
   filesystem to a chosen snapshot but keeps the chat history intact, enabling
   experimentation without losing conversation branches. [src/okcvm/api/main.py#L283-L309](../src/okcvm/api/main.py#L283-L309)
2. **Full reset.** `/api/session/history` with DELETE wipes the VM history and
   removes the workspace directory. The next interaction reinitialises the root
   node and provisions a new sandbox. [src/okcvm/api/main.py#L267-L282](../src/okcvm/api/main.py#L267-L282) [src/okcvm/session.py#L152-L207](../src/okcvm/session.py#L152-L207)

## Best practices

- Create explicit snapshots before major tool runs so you can diff outputs across
  branches.
- Reference `workspace_state.latest_snapshot` when generating external previews or
  deployments to avoid pointing users at stale assets.
- Clean up idle branches by deleting history once artefacts are archived, keeping
  disk usage predictable across long-running sessions.
