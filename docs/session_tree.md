# Session tree

The session tree links conversation history, workspace snapshots, deployments, and
slide artefacts into a navigable structure. It allows operators to branch, restore,
and audit multi-turn projects without losing context.

## Node types

1. **Root node – Session metadata.** `SessionState.boot()` seeds the tree with the
   welcome message, workspace descriptors, and virtual machine summary. Resetting
   history or the workspace clears this root and triggers a fresh initialisation
   on the next request. [src/okcvm/session.py#L521-L553](../src/okcvm/session.py#L521-L553)
2. **Conversation nodes – Message history.** `VirtualMachine.record_history_entry`
   generates deterministic IDs (e.g. `okcvm-12ab34cd-0001`) for each exchange,
   storing message content, tool traces, and metadata. `/api/session/history/{id}`
   returns any node so the frontend can render branches and tool details.
   [src/okcvm/vm.py#L229-L255](../src/okcvm/vm.py#L229-L255)
   [src/okcvm/api/main.py#L595-L606](../src/okcvm/api/main.py#L595-L606)
3. **Artefact nodes – Tool outputs.** When the agent calls a tool, the input,
   output, and status are persisted alongside the message so deployments, slide
   decks, and files appear as children in the tree for later inspection.
   [src/okcvm/session.py#L277-L519](../src/okcvm/session.py#L277-L519)

## Snapshot workflow

- `SessionState.respond()` labels each snapshot using the user prompt, then calls
  `workspace.state.snapshot()` to commit filesystem changes. The response embeds
  the commit hash, deduplicated artefacts, and recent history so the UI can
  annotate the timeline. [src/okcvm/session.py#L277-L519](../src/okcvm/session.py#L277-L519)
  [src/okcvm/workspace.py#L112-L207](../src/okcvm/workspace.py#L112-L207)
- `SessionState.restore_workspace()` applies `git reset --hard` to a requested
  hash and refreshes the workspace metadata returned to the client. Errors bubble
  up as `WorkspaceStateError`, which the API converts to HTTP 400 responses. [src/okcvm/session.py#L180-L207](../src/okcvm/session.py#L180-L207) [src/okcvm/workspace.py#L156-L167](../src/okcvm/workspace.py#L156-L167) [src/okcvm/api/main.py#L283-L309](../src/okcvm/api/main.py#L283-L309)
- Each conversation branch stores a dedicated Git branch. When the UI switches
  branches it calls `/api/session/workspace/restore` with the stored branch
  name so the sandbox checks out the matching commit automatically. [src/okcvm/workspace.py#L90-L213](../src/okcvm/workspace.py#L90-L213) [src/okcvm/session.py#L548-L586](../src/okcvm/session.py#L548-L586) [frontend/app/index.js#L70-L218](../frontend/app/index.js#L70-L218)
  up as `WorkspaceStateError`, which the API converts to HTTP 400 responses.
  [src/okcvm/session.py#L571-L588](../src/okcvm/session.py#L571-L588)
  [src/okcvm/api/main.py#L797-L845](../src/okcvm/api/main.py#L797-L845)

## Linking workspaces and history

- Each history node references the active workspace ID and mount paths via
  `VirtualMachine.describe()`. `/api/session/info` exposes these values so the UI
  can show the correct sandbox when operators jump between branches.
  [src/okcvm/vm.py#L203-L256](../src/okcvm/vm.py#L203-L256)
  [src/okcvm/api/main.py#L582-L594](../src/okcvm/api/main.py#L582-L594)
- Tool implementations receive the injected `WorkspaceManager`, write outputs to
  namespaced directories (e.g. `deployments/`, `generated_slides/`), and include
  session IDs in their metadata for cross-branch auditing.
  [src/okcvm/tools/deployment.py#L118-L320](../src/okcvm/tools/deployment.py#L118-L320)
  [src/okcvm/tools/slides.py#L1-L108](../src/okcvm/tools/slides.py#L1-L108)
- URLs returned to the frontend carry the associated `client_id`, preventing
  cross-session leakage when deployments are opened in new tabs.
  [src/okcvm/session.py#L239-L276](../src/okcvm/session.py#L239-L276)
  [src/okcvm/api/main.py#L525-L580](../src/okcvm/api/main.py#L525-L580)

## SQL persistence and Git metadata

- Conversation trees are persisted to the `okc_conversations` table so the UI
  can reload branches even after the VM restarts. Besides the JSON payload, each
  row captures the workspace root, mount, session identifier, current commit
  hash, and a dirty flag that mirrors the Git status at save time. [src/okcvm/storage/conversations.py#L21-L36](../src/okcvm/storage/conversations.py#L21-L36)
- `ConversationStore.save_conversation()` normalises timestamps, workspace
  paths, and Git metadata before inserting or updating a record. Editing a
  conversation in the UI (renaming, reordering nodes, or updating titles) maps
  to the same upsert path, which refreshes `updated_at`, rewrites the stored
  conversation tree, and records the latest Git head/dirty flag reported by the workspace. [src/okcvm/storage/conversations.py#L137-L214](../src/okcvm/storage/conversations.py#L137-L214) [src/okcvm/api/main.py#L525-L562](../src/okcvm/api/main.py#L525-L562)
- When conversations are listed or fetched, `_record_to_payload()` backfills
  any missing workspace or Git fields so downstream components always receive a
  consistent view of the repository state associated with each branch. [src/okcvm/storage/conversations.py#L229-L275](../src/okcvm/storage/conversations.py#L229-L275)

## Editing and deletion workflow

1. **Conversation edits.** The frontend issues `POST /api/conversations` for new
   trees and `PUT /api/conversations/{id}` when an existing tree is modified.
   Both routes call `save_conversation`, ensuring the SQL record and Git status
   stay in sync with the latest conversation tree structure. [src/okcvm/api/main.py#L536-L562](../src/okcvm/api/main.py#L536-L562)
2. **Conversation deletion.** `DELETE /api/conversations/{id}` removes the SQL
   row and then invokes `_cleanup_workspace()` to prune the saved workspace
   directory and deployment artefacts tied to that session, preventing orphaned
   Git sandboxes from lingering on disk. [src/okcvm/api/main.py#L564-L580](../src/okcvm/api/main.py#L564-L580) [src/okcvm/storage/conversations.py#L216-L339](../src/okcvm/storage/conversations.py#L216-L339)

## Reset and cleanup

1. **Selective rollback.** Calling `/api/session/workspace/restore` rewinds the
   filesystem to a chosen snapshot but keeps the chat history intact, enabling
   experimentation without losing conversation branches.
   [src/okcvm/api/main.py#L829-L845](../src/okcvm/api/main.py#L829-L845)
2. **Full reset.** `/api/session/history` with DELETE wipes the VM history and
   removes the workspace directory. The next interaction reinitialises the root
   node and provisions a new sandbox.
   [src/okcvm/api/main.py#L783-L809](../src/okcvm/api/main.py#L783-L809)
   [src/okcvm/session.py#L555-L569](../src/okcvm/session.py#L555-L569)

## Best practices

- Create explicit snapshots before major tool runs so you can diff outputs across
  branches.
- Reference `workspace_state.latest_snapshot` when generating external previews or
  deployments to avoid pointing users at stale assets.
- Clean up idle branches by deleting history once artefacts are archived, keeping
  disk usage predictable across long-running sessions.
