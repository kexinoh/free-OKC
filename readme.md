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

---

## OKCVM 项目指南（中文）

### 项目目的
OKCVM 是一个开源的虚拟机容器编排层，用于复现 Moonshot AI “OK Computer” 智能体的系统提示词和工具协议。项目打包了标准化的系统说明、工具清单以及核心工具的 Python 参考实现，帮助团队自建兼容的工作流。

### 仓库内容
- `spec/`：存放系统提示词与工具规范文件。
- `src/okcvm/`：虚拟机、工具注册表以及核心工具参考实现的 Python 源码。
- `frontend/`：与 OKCVM 集成相关的前端资源和原型。
- `tests/`：用于验证工具与注册表行为的自动化测试用例。
- `roadmap.md`、`roadmap.zh.md`：项目规划文档，分别提供英文和中文版本。
- `README_PROJECT.md`：补充的项目背景与架构说明。

### 部署与使用
1. **克隆仓库**并进入项目根目录。
2. **（可选）创建并激活虚拟环境**，以隔离依赖。
3. **安装依赖**：
   ```bash
   pip install -e .[dev]
   ```
4. **运行示例代码**，确认虚拟机能够调用工具：
   ```python
   from okcvm.vm import VirtualMachine
   from okcvm.registry import ToolRegistry
   from okcvm import spec

   registry = ToolRegistry.from_default_spec()
   vm = VirtualMachine(system_prompt=spec.load_system_prompt(), registry=registry)

   result = vm.call_tool("mshtools-shell", command="echo hello")
   print(result.output)
   ```
5. **执行测试**，在部署或扩展工具前确保功能稳定：
   ```bash
   pytest
   ```
6. **需要真实的多媒体能力时**，通过环境变量或代码配置 `OKCVM_*` 模型端点，例如图像生成、语音合成或音效服务。

### Web 服务与配置面板

仓库新增了一个基于 FastAPI 的本地服务，提供图形化的调度与配置界面。

1. **启动服务**：
   ```bash
   python -m okcvm.server
   ```
2. **访问界面**：打开 [http://localhost:8000/ui/](http://localhost:8000/ui/)，即可进入与「OK Computer」交互一致的对话工作台。
3. **填写模型端点**：在“模型配置”区域填写聊天、图像、语音合成、音效生成以及语音识别模型的 ID、Base URL 与 API Key。
4. **保存配置**：配置信息仅保存在当前进程内，API Key 不会回传至前端，如需修改请重新输入。
5. **开始对话**：在网页中发起对话后，后端会返回示例网页预览与幻灯片结构，演示多模态调度效果。
