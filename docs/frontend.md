# Frontend guide

The frontend lives in the [`frontend/`](../frontend) directory and is served as a
static bundle by FastAPI. It focuses on clarity, offline readiness, and bridging
API responses into a productive operator workflow.

## Layout and accessibility
- [`index.html`](../frontend/index.html) defines a three-pane layout: a history
  sidebar, chat workspace, and insight column with web/PPT previews. Buttons and
  interactive regions include ARIA attributes so the panel remains keyboard
  navigable. 【F:frontend/index.html†L16-L115】
- The settings overlay ships as an accessible dialog with labelled controls for
  configuring chat, image, speech, sound-effects, and ASR endpoints. The drawer
  toggles via the gear button and traps focus while open. 【F:frontend/index.html†L119-L220】

## State management and storage
- [`app.js`](../frontend/app.js) initialises DOM references, maintains a
  `conversations` array, and persists it to `localStorage` via the `storage`
  wrapper. It normalises conversation payloads, handles history toggling, and
  syncs the active conversation ID. 【F:frontend/app.js†L1-L360】
- Conversation rendering keeps pending assistant messages, updates titles based
  on the latest user input, and bumps the most recent conversation to the top of
  the list. The UI resets previews when switching sessions to avoid stale
  content. 【F:frontend/app.js†L360-L480】

## Preview rendering and logging
- The web preview frame and PPT carousel respond to tool outputs returned by the
  backend. HTML snippets are written into an iframe, while slides populate a
  template-driven list with toggleable carousel mode. 【F:frontend/app.js†L624-L677】
- `logModelInvocation` captures the meta telemetry from `/api/chat` responses,
  capping the timeline to six entries and keeping the empty state in sync.
  【F:frontend/app.js†L598-L622】

## Networking and form handling
- `fetchJson` centralises error handling for backend requests. `populateConfigForm`
  writes endpoint descriptions into the settings form, while `submitConfigForm`
  sends updates back to `/api/config` and surfaces success/error states.
  【F:frontend/app.js†L689-L789】
- Chat submissions append a pending assistant message, call `/api/chat`, then
  resolve the placeholder with the final reply and any preview data.
  【F:frontend/app.js†L810-L851】
