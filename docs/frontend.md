# Frontend guide

The operator console lives in [`frontend/`](../frontend) and is served as a static
bundle by FastAPI. It focuses on clarity, offline readiness, and presenting agent
activity in a way that supports rapid iteration.

## Layout and accessibility
- [`index.html`](../frontend/index.html) defines landmark regions, the chat
  surface, and settings drawers using labelled controls and focus guards so the
  console remains keyboard accessible.
  [frontend/index.html#L16-L220](../frontend/index.html#L16-L220)
- [`styles.css`](../frontend/styles.css) implements the responsive shell,
  high-contrast colour system, and focus outlines for dialogs, drawers, and the
  preview pane. Custom properties such as `--history-offset` keep the layout
  stable during resizes. [frontend/styles.css#L1-L220](../frontend/styles.css#L1-L220)
- [`elements.js`](../frontend/elements.js) centralises DOM lookups so feature
  modules depend on semantic IDs rather than querying the document directly,
  reducing the risk of stale selectors.
  [frontend/elements.js#L1-L37](../frontend/elements.js#L1-L37)

## Application composition
- [`app/index.js`](../frontend/app/index.js) orchestrates history layout,
  streaming, uploads, configuration drawers, and conversation rendering. It wires
  together specialised controllers and keeps the main file a coordinator rather
  than a data store. [frontend/app/index.js#L1-L947](../frontend/app/index.js#L1-L947)
- Supporting modules include [`historyLayout.js`](../frontend/app/historyLayout.js)
  for dynamic sidebar sizing, [`messageRenderer.js`](../frontend/app/messageRenderer.js)
  for DOM updates, and [`conversationPanel.js`](../frontend/app/conversationPanel.js)
  for session switching. [frontend/app/historyLayout.js#L1-L90](../frontend/app/historyLayout.js#L1-L90)
  [frontend/app/messageRenderer.js#L1-L410](../frontend/app/messageRenderer.js#L1-L410)
  [frontend/app/conversationPanel.js#L1-L236](../frontend/app/conversationPanel.js#L1-L236)
- [`streamingController.js`](../frontend/app/streamingController.js) connects the
  SSE endpoint to live message rendering, tool telemetry cards, and reasoning
  transcripts. [frontend/app/streamingController.js#L1-L183](../frontend/app/streamingController.js#L1-L183)

## Conversation state and persistence
- [`conversationState.js`](../frontend/conversationState.js) owns the in-memory
  model, snapshots conversation branches, normalises previews/workspace metadata,
  and schedules background saves to the server-side store.
  [frontend/conversationState.js#L1-L810](../frontend/conversationState.js#L1-L810)
- [`conversationApi.js`](../frontend/conversationApi.js) provides fetch helpers
  for listing, updating, and deleting conversations via the REST API, keeping the
  persistence layer encapsulated. [frontend/conversationApi.js#L1-L25](../frontend/conversationApi.js#L1-L25)
- Branch utilities (`ensureBranchBaseline`, `commitBranchTransition`,
  `syncActiveBranchSnapshots`) capture before/after snapshots so users can explore
  alternative replies without losing history.
  [frontend/conversationState.js#L373-L492](../frontend/conversationState.js#L373-L492)

## Networking and client identity
- [`utils.js`](../frontend/utils.js) issues authenticated requests: `fetchJson`
  and `postFormData` inject the caller’s `client_id` into headers and URLs, while
  `streamJson` handles SSE parsing and error propagation.
  [frontend/utils.js#L136-L288](../frontend/utils.js#L136-L288)
- The helper also generates and stores client identifiers across cookies and
  `localStorage`, ensuring multiple tabs reuse the same backend session.
  [frontend/utils.js#L1-L134](../frontend/utils.js#L1-L134)

## File uploads and streaming
- Upload workflows live in [`app/index.js`](../frontend/app/index.js), which
  enforces size/count limits, posts `FormData` to `/api/session/files`, and merges
  summaries into the chat timeline. [frontend/app/index.js#L171-L302](../frontend/app/index.js#L171-L302)
- Streaming responses use the SSE helper plus
  [`streamingController.js`](../frontend/app/streamingController.js) to append
  incremental tokens and tool status cards before finalising the assistant
  message. [frontend/app/streamingController.js#L118-L183](../frontend/app/streamingController.js#L118-L183)

## Previews and telemetry
- [`previews.js`](../frontend/previews.js) renders web iframes, slide decks, and
  the model log timeline. It normalises backend payloads, manages sandbox modes,
  and caps telemetry history for readability.
  [frontend/previews.js#L1-L200](../frontend/previews.js#L1-L200)
- Preview controls expose actions such as opening deployments or toggling slide
  carousel mode, keeping the insight column interactive without coupling it to
  chat rendering. [frontend/previews.js#L200-L328](../frontend/previews.js#L200-L328)

## Configuration and message editing
- [`config.js`](../frontend/config.js) loads and submits model configuration,
  displays status feedback, and redacts API keys after each save.
  [frontend/config.js#L1-L109](../frontend/config.js#L1-L109)
- [`app/editingController.js`](../frontend/app/editingController.js) manages
  inline message editing, form state, and branch updates so regenerated replies
  remain consistent. [frontend/app/editingController.js#L1-L353](../frontend/app/editingController.js#L1-L353)
- [`messageActionIcons.js`](../frontend/messageActionIcons.js) and
  [`markdown.js`](../frontend/markdown.js) encapsulate button cloning and secure
  Markdown rendering, reducing duplication when extending the chat UI.
  [frontend/messageActionIcons.js#L1-L23](../frontend/messageActionIcons.js#L1-L23)
  [frontend/markdown.js#L1-L35](../frontend/markdown.js#L1-L35)

## Extending the UI

When adding new frontend capabilities:

1. Update `conversationState.js` (and its persistence schema) alongside any new
   state shape to keep storage deterministic.
2. Route network requests through `fetchJson`/`streamJson` so client identifiers
   and error handling stay consistent.
3. Extend `previews.js` when introducing new artefact types; prefer injecting
   metadata via the backend rather than parsing DOM content.
4. Keep accessibility guards in sync—update `elements.js`, ARIA labels in
   `index.html`, and focus logic in the relevant controllers as new controls
   appear.
