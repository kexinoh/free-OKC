
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

## 📂 Repository Structure

```
.
├── spec/                # 📜 Canonical system prompt and tool specification files
├── src/okcvm/           # 🐍 Python source for the VM, tool registry, and reference tools
├── frontend/            # 🎨 Assets and UI prototypes for OKCVM integrations
├── tests/               # 🧪 Automated test suite for validating tool and registry behavior
├── roadmap.md           # 🗺️ Project development roadmap (English)
├── roadmap.zh.md        # 🗺️ Project development roadmap (Chinese)
└── README_PROJECT.md    # 📄 Additional background on project goals and architecture
```

## 🛠️ Getting Started

Get OKCVM up and running locally in just a few steps and experience its power.

#### 1. Clone & Install

```bash
# Clone the repository and navigate into the directory
git clone https://github.com/moonshot-ai/ok-computer-vm.git
cd ok-computer-vm

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
> You can always fall back to `python -m okcvm.server` after confirming you are
> using the correct interpreter.

#### 2. Open the UI

Navigate to the following URL in your browser: **[http://localhost:8000/ui/](http://localhost:8000/ui/)**

<div align="center">
  <br/>
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

The demo FastAPI service keeps a single global `SessionState` instance in [`src/okcvm/api/main.py`](src/okcvm/api/main.py), so every browser tab shares the same conversation and workspace context. There is no automatic per-visitor isolation in this mode.【F:src/okcvm/api/main.py†L63-L69】

To run multi-user or multi-session deployments, allocate a dedicated `SessionState` per user (for example by binding it to an authenticated account or an explicit session ID) and pass that instance into the relevant API routes.

#### 6. Troubleshooting Tool Errors

- **Session workspace paths**: Every chat session is assigned a random virtual mount such as `/mnt/okcvm-12ab34cd/`. The file tools (`mshtools-write_file`, `mshtools-read_file`, `mshtools-edit_file`) automatically resolve relative paths inside this mount, so commands like `resume-website/index.html` are stored safely without leaking across sessions. Passing a path outside the mount will raise a "path outside workspace" error.
- **State snapshots**: Each workspace is Git-backed. OKCVM automatically checkpoints the sandbox after every assistant reply and exposes API endpoints so you can list snapshots or roll back to a previous turn—perfect for "oops" moments in long multi-turn projects.

---

We're thrilled to have you join the project! Whether it's through code contributions, suggestions, or bug reports, all forms of participation are welcome. Let's build the future of agentic workflows together!

<p align="right"><a href="#top">🔼 Back to Top</a></p>
