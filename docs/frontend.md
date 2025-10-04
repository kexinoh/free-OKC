# Frontend guide

The operator console lives in [`frontend/`](../frontend) and is served as a static
bundle by FastAPI. It focuses on clarity, offline readiness, and presenting agent
activity in a way that supports rapid iteration.

## Layout and accessibility
- [`index.html`](../frontend/index.html) defines a three-pane layout consisting of
  a history sidebar, chat workspace, and insight column with web/PPT previews.
  Landmark roles and ARIA attributes ensure the panel stays keyboard navigable,
  including focus management for dialogs and interactive lists.【F:frontend/index.html†L16-L220】
- The settings overlay is implemented as an accessible dialog with labelled
  controls for configuring chat, image, speech, sound-effects, and ASR endpoints.
  The drawer toggles via the gear button, traps focus while open, and restores
  focus when dismissed.【F:frontend/index.html†L119-L220】

## State management
- [`app.js`](../frontend/app.js) initialises DOM references, memoises them in a
  `ui` registry, and coordinates rendering via pure functions rather than heavy
  frameworks. Conversation state is persisted to `localStorage` using the
  `storage` helper, allowing tab reloads to restore context instantly.【F:frontend/app.js†L1-L360】
- The `state` object tracks conversations, active session IDs, pending messages,
  preview metadata, and configuration status. Mutations go through dedicated
  reducers (`upsertConversation`, `setActiveConversation`, etc.) so the rendering
  layer can remain predictable.【F:frontend/app.js†L360-L620】

## Rendering pipeline
- Conversations render as grouped bubbles with optimistic assistant placeholders.
  When `/api/chat` resolves, the placeholder is replaced with the final response,
  previews are refreshed, and the conversation list reorders to keep the most
  recent threads on top.【F:frontend/app.js†L624-L851】
- Web previews write HTML into an iframe using `srcdoc`, while slide decks map
  over returned PPT metadata to render cards and a modal carousel. The UI guards
  against stale previews by clearing frames whenever the active conversation
  changes.【F:frontend/app.js†L624-L789】

## Networking and error handling
- `fetchJson` centralises HTTP requests with timeout handling, descriptive error
  messages, and automatic JSON parsing. It powers configuration, session boot,
  chat submission, snapshot management, and deployment asset lookups.【F:frontend/app.js†L689-L851】
- Form helpers (`populateConfigForm`, `submitConfigForm`) sync backend
  descriptions into the drawer, handle optimistic UI states, and surface toast
  notifications upon success or failure.【F:frontend/app.js†L689-L789】

## Telemetry and logging
- `logModelInvocation` captures the meta telemetry returned by `/api/chat`,
  capping the timeline to six entries, showing token usage, tool invocations, and
  latency summaries. The empty state is kept in sync when conversations reset.【F:frontend/app.js†L598-L677】
- A debug console is rendered conditionally when `localStorage.debug` is set,
  echoing raw payloads to help diagnose integration issues without opening the
  browser inspector.【F:frontend/app.js†L552-L620】

## Extending the UI

When adding new backend capabilities:

1. Update the `state` shape and provide dedicated render/update helpers rather
   than mutating DOM nodes inline.
2. Keep network access wrapped in `fetchJson` so error handling stays
   consistent.
3. Reflect new previews in both the main insight pane and the history list to
   maintain spatial awareness for operators.
4. Update documentation and alt text to keep the console accessible across
   screen readers and localisation contexts.
