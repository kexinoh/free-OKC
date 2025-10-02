# Roadmap

## Implemented Capabilities

### System prompt & manifest bundling
We package the upstream system prompt and tool manifest with loader helpers so clients can bootstrap OKCVM without extra configuration.
- `okcvm.spec` exposes dataclasses and loaders that read the packaged `system_prompt.md` and `tools.json`, returning structured specifications for downstream consumers. ([`src/okcvm/spec.py#L1-L57`](./src/okcvm/spec.py#L1-L57))

### Tool registry with default bindings
The ToolRegistry automatically wires every manifest entry to a concrete implementation or a stub to maintain spec parity.
- Default construction loads the manifest, registers all shipped tool classes, and fills any gaps with informative stub tools so the public API stays coherent as the spec evolves.【F:src/okcvm/registry.py†L25-L110】

### Virtual machine façade
The VirtualMachine class orchestrates tool calls, preserves recent history, and surfaces a serialisable description for host applications.
- Each invocation is routed through the registry, recorded with arguments and results, and exposed through helper methods such as `describe`, `describe_history`, and `last_result` for agent integrations.【F:src/okcvm/vm.py†L1-L73】

### Productivity toolchain coverage
We ship working implementations of the todo list, file management, shell, and IPython execution tools defined in the OK Computer contract.
- The todo tools persist JSON records on disk, supporting full rewrites and append workflows to mirror the upstream behaviour.【F:src/okcvm/tools/todo.py†L1-L88】
- File tools enforce absolute paths, support binary-safe reads and writes, and provide guarded edit operations that mimic the expected agent ergonomics.【F:src/okcvm/tools/files.py†L1-L93】
- The shell and IPython tools execute commands with captured output, optional resets, and simple `` `!` ``-prefixed shell escapes inside Python sessions.【F:src/okcvm/tools/shell.py†L1-L32】【F:src/okcvm/tools/ipython.py†L1-L60】

### Web, media, and deployment utilities
We include lightweight browser simulation, search/media synthesis, deployment, and slide generation tooling aligned with the OKC spec.
- The browser module provides deterministic HTTP-based navigation, element discovery, and a memory-backed session model to support scripted exploration flows.【F:src/okcvm/tools/browser.py†L1-L143】
- Search utilities wrap DuckDuckGo endpoints for web and image queries via deterministic HTTP clients to support research flows.【F:src/okcvm/tools/search.py†L1-L144】
- Media and slides tools generate synthetic images, speech, sound effects, and PPTX decks so agents can complete end-to-end creative tasks without external services.【F:src/okcvm/tools/media.py†L1-L200】【F:src/okcvm/tools/slides.py†L1-L74】
- Data source and deployment helpers cover the Yahoo Finance quote API and static site publishing to mirror commonly used OK Computer workflows.【F:src/okcvm/tools/data_sources.py†L1-L96】【F:src/okcvm/tools/deployment.py†L1-L66】

## Planned and In-Progress Work

### Richer browser automation
The current HTTP scraper intentionally omits JavaScript execution, multi-tab state, and complex form handling, so we plan to integrate a headless browser backend for higher fidelity tasks.【F:src/okcvm/tools/browser.py†L1-L22】
- Explore adopting Playwright or Selenium drivers with configurable resource limits while keeping a fallback deterministic mode for tests.
- Extend the session model to capture cookies, local storage, and navigation history so agents can manage authenticated workflows.

### Broader data source catalogue
Our data source registry only ships a Yahoo Finance quote endpoint today, leaving many upstream data integrations unavailable.【F:src/okcvm/tools/data_sources.py†L22-L96】
- Add additional market, news, and knowledge APIs with consistent serialization to expand analytical coverage.
- Introduce pluggable configuration for API keys and rate limits to support production deployments.

### Future tool spec parity
The registry already prepares stub fallbacks for spec entries without implementations, highlighting the need to flesh out new tools as the manifest grows.【F:src/okcvm/registry.py†L72-L91】
- Track upstream changes to the OK Computer tool contract and land native implementations quickly to avoid stubbed responses.
- Provide contribution guidelines and scaffolding generators to make community tool development straightforward.

### Higher fidelity media generation
Synthetic image and audio outputs are deterministic placeholders, so we aim to integrate optional model-backed pipelines for richer creative results.【F:src/okcvm/tools/media.py†L37-L200】
- Evaluate lightweight diffusion or TTS backends that can run locally while offering significant quality improvements over hashed textures and sine-wave synthesis.
- Define caching and asset management conventions to keep generated media organised for downstream sharing tools.
