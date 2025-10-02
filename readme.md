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
