# Frontend guide

The operator console lives in [`frontend/`](../frontend) and is served as a static
bundle by FastAPI. It focuses on clarity, offline readiness, and presenting agent
activity in a way that supports rapid iteration.

## Layout and accessibility
- [`index.html`](../frontend/index.html) defines the workspace header, chat
  surface, insight column, and history sidebar using landmark roles, labelled
  controls, and focus traps so the console remains keyboard accessible. [frontend/index.html#L16-L220](../frontend/index.html#L16-L220)
- [`styles.css`](../frontend/styles.css) implements the responsive shell,
  high-contrast colour system, and focus outlines for dialogs, drawers, and the
  preview pane. Utility custom properties (`--history-offset`, `--history-height`)
  are toggled by the runtime to keep the layout stable during resizes. [frontend/styles.css#L1-L200](../frontend/styles.css#L1-L200)
- [`elements.js`](../frontend/elements.js) centralises DOM lookups so other
  modules can depend on semantic IDs instead of querying the document directly,
  reducing the risk of stale selectors. [frontend/elements.js#L1-L120](../frontend/elements.js#L1-L120)

## Application composition
- [`app.js`](../frontend/app.js) orchestrates event wiring: it loads stored
  conversations, initialises preview controls, binds history layout observers,
  and delegates actions (send, regenerate, branch, open editor) to specialised
  helpers. [frontend/app.js#L1-L260](../frontend/app.js#L1-L260)
- The module imports focused utilities for rendering (`previews.js`),
  conversation state (`conversationState.js`), configuration (`config.js`), and
  editing (`editor.js`), keeping the main file a coordinator rather than a data
  store. [frontend/app.js#L21-L80](../frontend/app.js#L21-L80)
- UI state (active conversation, pending messages, history layout measurements)
  is tracked through pure functions so rerenders remain predictable and
  testable. [frontend/app.js#L262-L720](../frontend/app.js#L262-L720)

## Conversation state and branching
- [`conversationState.js`](../frontend/conversationState.js) owns the in-memory
  model: it persists conversations, message branches, and selection indices,
  generates stable IDs, and keeps storage snapshots in sync. [frontend/conversationState.js#L1-L260](../frontend/conversationState.js#L1-L260)
- Branch management utilities (`ensureBranchBaseline`, `commitBranchTransition`,
  `captureBranchSelections`) capture before/after snapshots so users can explore
  alternative replies without losing history. [frontend/conversationState.js#L60-L200](../frontend/conversationState.js#L60-L200)
- [`storage.js`](../frontend/storage.js) guards `localStorage` access, falling
  back gracefully when the environment disallows persistence. [frontend/storage.js#L1-L36](../frontend/storage.js#L1-L36)

## Networking and client identity
- [`utils.js`](../frontend/utils.js) issues authenticated requests: `fetchJson`
  injects the caller’s `client_id` into headers and URLs, handles JSON parsing,
  and normalises errors for user-friendly toasts. [frontend/utils.js#L1-L120](../frontend/utils.js#L1-L120)
- The helper also generates and stores `client_id` values, syncing cookies and
  `localStorage` so multiple tabs share the same backend session. [frontend/utils.js#L30-L90](../frontend/utils.js#L30-L90)
- [`config.js`](../frontend/config.js) builds on these utilities to populate and
  submit the model configuration drawer, redacting API keys after each save. [frontend/config.js#L1-L110](../frontend/config.js#L1-L110)

## Previews and telemetry
- [`previews.js`](../frontend/previews.js) renders web iframes, slide decks, and
  the model log timeline. It normalises backend payloads, manages sandbox modes,
  and caps telemetry history for readability. [frontend/previews.js#L1-L200](../frontend/previews.js#L1-L200)
- Preview controls expose actions such as opening deployments in a new tab or
  toggling slide carousel mode, keeping the insight column interactive without
  coupling it to chat rendering. [frontend/previews.js#L200-L360](../frontend/previews.js#L200-L360)

## Configuration and message editing
- [`config.js`](../frontend/config.js) pairs service-specific inputs with status
  messaging so operators know when credentials were loaded, saved, or require
  re-entry. [frontend/config.js#L14-L110](../frontend/config.js#L14-L110)
- [`editor.js`](../frontend/editor.js) wraps the Toast UI Markdown editor in an
  accessible dialog, handling focus management, keyboard shortcuts, and async
  resolution so chat regeneration can reuse user-edited prompts. [frontend/editor.js#L1-L160](../frontend/editor.js#L1-L160)
- [`messageActionIcons.js`](../frontend/messageActionIcons.js) and
  [`markdown.js`](../frontend/markdown.js) encapsulate button cloning and secure
  markdown rendering, reducing duplication when extending the chat UI. [frontend/messageActionIcons.js#L1-L120](../frontend/messageActionIcons.js#L1-L120) [frontend/markdown.js#L1-L160](../frontend/markdown.js#L1-L160)

## Extending the UI

When adding new frontend capabilities:

1. Update `conversationState.js` (and its storage schema) alongside any new
   state shape to keep persistence deterministic.
2. Route network requests through `fetchJson` so client identifiers and error
   handling stay consistent.
3. Extend `previews.js` when introducing new artefact types; prefer injecting
   metadata via the backend rather than parsing DOM content.
4. Keep accessibility guards in sync—update `elements.js`, ARIA labels in
   `index.html`, and focus logic in `app.js`/`editor.js` as new controls appear.
