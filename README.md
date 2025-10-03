<a id="top"></a>

# OKCVM Project Guide

## Purpose
OKCVM is an open-source virtual machine container orchestration layer that reproduces the system prompt and tool contract of Moonshot AI's "OK Computer" agent. It enables teams to self-host a compatible workflow by bundling the canonical system instructions, the tool manifest, and Python implementations of the core tools.

## Repository Contents
- `spec/`: Canonical system prompt and tool specification files.
- `src/okcvm/`: Python source code for the virtual machine, tool registry, and reference tool implementations.
- `frontend/`: Assets and UI prototypes related to OKCVM integrations.
- `tests/`: Automated test suite for validating tool and registry behavior.
- `roadmap.md`, `roadmap.zh.md`: Planning documents that outline upcoming milestones in English and Chinese.
- `README_PROJECT.md`: Additional background information about the project goals and architecture.

## Deployment & Setup
1. **Clone the repository** and switch into the project directory.
2. **Create and activate a virtual environment** (optional but recommended).
3. **Install dependencies**:
   ```bash
   pip install -e .[dev]
   ```
4. **Run the example** to verify the virtual machine can call a tool:
   ```python
   from okcvm.vm import VirtualMachine
   from okcvm.registry import ToolRegistry
   from okcvm import spec

   registry = ToolRegistry.from_default_spec()
   vm = VirtualMachine(system_prompt=spec.load_system_prompt(), registry=registry)

   result = vm.call_tool("mshtools-shell", command="echo hello")
   print(result.output)
   ```
5. **Execute tests** before deploying or extending the toolset:
   ```bash
   pytest
   ```
6. **Configure optional media endpoints** when integrating real image, speech, or sound-effect providers by exporting the appropriate `OKCVM_*` environment variables or supplying the configuration programmatically.

### Web Orchestrator & Configuration

The repository now bundles a FastAPI service that exposes the virtual machine together with a web-based control panel.

1. **Start the service**:
   ```bash
   python -m okcvm.server
   ```
2. **Open the UI** at [http://localhost:8000/ui/](http://localhost:8000/ui/). The landing page provides a chat-first workflow that mirrors the reference "OK Computer" experience.
3. **Populate model endpoints** in the "模型配置" form. Supply model identifiers, base URLs, and API keys for:
   - Chat completions
   - Image generation
   - Text-to-speech
   - Sound-effect synthesis
   - Automatic speech recognition
4. **Save the configuration**. Credentials are stored in-process only; API keys are never echoed back to the browser, so re-enter them when making changes.
5. **Start chatting**. Messages posted in the UI are relayed to the FastAPI backend, which returns curated previews and sample slide manifests.
