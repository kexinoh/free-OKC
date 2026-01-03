
<div align="center">

<a id="top"></a>

# OK Computer Virtual Machine (OKCVM)

### ✨ OK Computer in a Box: Your Self-Hosted Agent Workflow Layer ✨

</div>

<div align="center">
  
[OKCVM 中文文档 (Chinese README)](README_ZH.md)

</div>

**OKCVM** is an open-source virtual machine container orchestration layer that faithfully reproduces the system prompt and tool contract used by Moonshot AI's "OK Computer" agent. By bundling the canonical system instructions, tool manifest, and Python implementations of core tools, OKCVM empowers any team to easily self-host a compatible agent workflow.

Imagine seamlessly embedding a powerful, multi-modal agent brain into your own applications. OKCVM is the cornerstone to make that a reality.

## 🚀 Features

- **🤖 Canonical Replication**: Includes the exact system prompts and tool specifications as Moonshot AI's "OK Computer".
- **🛠️ Ready-to-Use Toolset**: Comes with built-in Python reference implementations for core tools like file system access, code execution, and web browsing.
- **🌐 Web UI Included**: Ships with a FastAPI-based web service and control panel, offering an out-of-the-box chat and configuration experience.
- **🧩 Highly Extensible**: Designed for extension. Easily register your own custom tools or swap out media generation endpoints.
- **✅ Tested & Reliable**: Features a comprehensive automated test suite to ensure the VM and tools behave as expected.
- **🔌 Effortless Integration**: Provides a clean Python API, making it simple to integrate OKCVM into your existing systems.
- **💾 Persistent Conversations**: Conversation trees and workspace metadata are stored in a MySQL-compatible database, enabling token-based multi-account access across browsers.

## 🖥️ Desktop Client (Recommended)

> **✨ Primary Interface**: The OKCVM Desktop client is now our recommended way to interact with the agent. It provides a native, streamlined experience with built-in backend integration.

The Desktop client is a cross-platform Electron application that bundles the Python backend with a native user interface:

- **🚀 Zero Configuration** - No manual backend setup required. Everything runs out of the box.
- **🌐 Cross-Platform** - Native builds for macOS, Windows, and Linux.
- **🖥️ Native Experience** - System tray integration, global shortcuts, and native notifications.
- **🔄 Auto-Updates** - Built-in updater keeps you on the latest version.
- **🌙 Dark Mode** - Follows your system theme automatically.
- **📁 File Integration** - Native file dialogs and drag-and-drop support.

### Quick Start (Desktop)

1. **Download** the latest release for your platform from [GitHub Releases](https://github.com/kexinoh/free-OKC/releases)
2. **Install** the application (DMG for macOS, NSIS installer for Windows, AppImage/DEB for Linux)
3. **Launch** OKCVM from your Applications folder or Start Menu
4. **Configure** your model endpoints in the settings panel
5. **Start chatting** with your self-hosted agent!

For development setup and building from source, see the [Desktop README](desktop/README.md).

## 📂 Repository Structure

```
.
├── spec/                # 📜 Canonical system prompt and tool specification files
├── src/okcvm/           # 🐍 Python source for the VM, tool registry, and reference tools
├── frontend/            # 🎨 Static operator console served by the FastAPI backend
├── desktop/             # 🖥️ Cross-platform Electron desktop application
├── docs/                # 🧭 In-depth architecture, backend, and frontend documentation
├── tests/               # 🧪 Automated test suite for validating tool and registry behavior
├── roadmap.md           # 🗺️ Project development roadmap (English)
├── roadmap.zh.md        # 🗺️ Project development roadmap (Chinese)
├── security.md          # 🔐 Security and hardening notes for deployments
└── config.yaml          # ⚙️ Sample runtime configuration consumed by the CLI and API
```

## 🛠️ Development Setup & API Usage

For developers who want to integrate OKCVM or contribute to the project. **End users should use the Desktop client above.**

#### 1. Clone & Install

```bash
# Clone the repository and navigate into the directory
git clone https://github.com/kexinoh/free-OKC.git
cd free-OKC

# Create and activate a virtual environment (recommended)
python -m venv venv
source venv/bin/activate  # macOS / Linux
# venv\Scripts\activate   # Windows

# Install dependencies (including dev and test tools)
pip install -e .[dev]
```

#### 2. Programmatic Usage

Verify that the virtual machine can successfully call a tool with a simple Python script.

```python
from okcvm.vm import VirtualMachine
from okcvm.registry import ToolRegistry
from okcvm import spec

# Load the tool registry from the default specification
registry = ToolRegistry.from_default_spec()

# Initialize the VM, injecting the system prompt and tools
vm = VirtualMachine(system_prompt=spec.load_system_prompt(), registry=registry)

# Call a tool, for example, to execute a shell command
result = vm.call_tool("mshtools-shell", command="echo hello from OKCVM!")

# Print the output from the tool execution
print(result.output)
# > hello from OKCVM!
```

#### 3. Run Tests

Before deploying or extending the toolset, always run the tests to ensure everything is working correctly.

```bash
pytest
```

## 🌐 Launch the Web Orchestrator

OKCVM includes a full-featured web application that allows you to interact with and configure the agent through a graphical interface.

#### 1. Start the Service

```bash
# After `pip install -e .[dev]`
okcvm-server
```
This console script wraps the same Typer entry point as `python -m okcvm.server`,
so you can launch the service directly from the project root without changing
directories. The service will start on `http://localhost:8000`.

> **Windows troubleshooting**
>
> If PowerShell reports `ModuleNotFoundError: No module named 'okcvm'` when you
> try `python -m okcvm.server`, the interpreter being used to start the server
> is not the one where the package was installed. Make sure your virtual
> environment is activated by running `.\venv\Scripts\Activate.ps1` in PowerShell.
> Your prompt should then include the environment's name (e.g., `(free-OKC)`). If the problem persists, reinstall
> the project in editable mode from the repository root so that the
> `okcvm-server` entry point is registered in the current environment:
>
> ```powershell
> pip install -e .
> okcvm-server
> ```
>
> You can always fall back to `cd src & python -m okcvm.server` after confirming you are
> using the correct interpreter.

#### 2. Open the UI

Navigate to the following URL in your browser: **[http://localhost:8000/ui/](http://localhost:8000/ui/)**

<div align="center">
  <br/>
  <img width="2893" height="1921" alt="image" src="https://github.com/user-attachments/assets/2b1da3b3-762a-4e39-a356-879f3e782740" />

  <em>The OKCVM Web Control Panel</em>
</div>

#### 3. Configure Model Endpoints

On your first visit, the UI will guide you through the setup process.

1.  In the "Model Configuration" form, enter your model service information, API Base URL, and API Keys.
2.  OKCVM supports configuring the following model types:
    -   **Chat Completions**: The core conversational model.
    -   **Image Generation**: For creating pictures.
    -   **Text-to-Speech**: For generating audio.
    -   **Sound-Effect Synthesis**: For creating sound effects.
    -   **Automatic Speech Recognition (ASR)**: For voice input.
3.  Click **Save Configuration**.
    *   *Security Note*: Your credentials are only processed in-memory by the service. API keys are never echoed back to the browser. You will need to re-enter them each time you make changes.

#### 4. Start Chatting

Once configured, you're ready to interact with the agent in the chat interface! All messages are sent to the backend VM for processing and will return curated previews and results.

#### 5. Concurrency & Multi-User Access

The FastAPI layer now provisions a dedicated `SessionState` per `client_id`. A stable identifier is stored in both cookies and `localStorage`, so each browser automatically receives an isolated workspace while multiple tabs from the same client remain in sync. [`src/okcvm/api/main.py`](src/okcvm/api/main.py) [`frontend/utils.js`](frontend/utils.js)

To integrate with your own identity system, resolve the authenticated account or session identifier on each request and pass it into the API via the `client_id` query parameter or the `x-okc-client-id` header. Sessions can also be pre-provisioned server side through [`SessionStore`](src/okcvm/api/main.py#L94-L149) if you need to share a workspace between collaborators.

#### 6. Troubleshooting Tool Errors

- **Session workspace paths**: Every chat session is assigned a random virtual mount such as `/mnt/okcvm-12ab34cd/`. The file tools (`mshtools-write_file`, `mshtools-read_file`, `mshtools-edit_file`) automatically resolve relative paths inside this mount, so commands like `resume-website/index.html` are stored safely without leaking across sessions. Passing a path outside the mount will raise a "path outside workspace" error.
- **State snapshots**: Each workspace is Git-backed. OKCVM automatically checkpoints the sandbox after every assistant reply and exposes API endpoints so you can list snapshots or roll back to a previous turn—perfect for "oops" moments in long multi-turn projects.

---

We're thrilled to have you join the project! Whether it's through code contributions, suggestions, or bug reports, all forms of participation are welcome. Let's build the future of agentic workflows together!

<p align="right"><a href="#top">🔼 Back to Top</a></p>
