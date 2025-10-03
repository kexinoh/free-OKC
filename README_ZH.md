<div align="center">

<a id="top"></a>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/moonshot-ai/ok-computer-vm/main/frontend/assets/okcvm-logo-dark.svg">
</picture>

# OK Computer Virtual Machine (OKCVM)

### ✨ OK Computer in a Box: Your Self-Hosted Agent Workflow Layer ✨

</div>

<div align="center">

[![Python Version][python-shield]][python-link]
[![PyPI Version][pypi-shield]][pypi-link]
[![License][license-shield]][license-link]
[![Tests][tests-shield]][tests-link]

[OKCVM 英文文档 (English README)](README.md)

</div>

**OKCVM** 是一个开源的虚拟机容器编排层，它精确复刻了 Moonshot AI 的 "OK Computer" 智能体所使用的系统指令 (System Prompt) 和工具合约 (Tool Contract)。通过系统指令、工具清单以及核心工具的 Python 实现打包在一起，OKCVM 使得任何团队都能轻松地自托管一个兼容的智能体工作流。

想象一下，将一个强大、多模态的智能体大脑，无缝地植入到你自己的应用中。OKCVM 就是实现这一目标的基石。

## 🚀 特性概览 (Features)

- **🛠️ 即用型工具集**: 内置了文件系统、代码执行、网络浏览等核心工具的 Python 参考实现。
- **🌐 Web 用户界面**: 自带一个基于 FastAPI 的 Web 服务和控制面板，提供开箱即用的聊天和配置体验。
- **🧩 高度可扩展**: 专为扩展而设计，你可以轻松注册自定义工具，或替换媒体生成端点。
- **✅ 经过测试，稳定可靠**: 包含一套全面的自动化测试套件，确保虚拟机和工具的行为符合预期。
- **🔌 轻松集成**: 提供了简洁的 Python API，可以轻松地将 OKCVM 集成到你现有的系统中。

## 📂 项目结构 (Repository Structure)

```
.
├── spec/                # 📜 系统指令和工具规范文件
├── src/okcvm/           # 🐍 虚拟机、工具注册表和工具实现的 Python 源代码
├── frontend/            # 🎨 与 OKCVM 集成相关的前端资源和 UI 原型
├── tests/               # 🧪 用于验证工具和注册表行为的自动化测试套件
├── roadmap.md           # 🗺️ 项目发展路线图 (英文)
├── roadmap.zh.md        # 🗺️ 项目发展路线图 (中文)
└── README_PROJECT.md    # 📄 关于项目目标和架构的更多背景信息
```

## 🛠️ 快速开始 (Getting Started)

只需几步，即可在本地运行并体验 OKCVM 的强大功能。

#### 1. 克隆与安装 (Clone & Install)

```bash
git clone https://github.com/kexinoh/free-OKC.git
cd ok-computer-vm

python -m venv venv
source venv/bin/activate  # macOS / Linux
# venv\Scripts\activate   # Windows

pip install -e .[dev]
```

#### 2. 编程方式调用 (Programmatic Usage)

通过一个简单的 Python 脚本，验证虚拟机是否能成功调用工具。

```python
from okcvm.vm import VirtualMachine
from okcvm.registry import ToolRegistry
from okcvm import spec

# 从默认规范加载工具注册表
registry = ToolRegistry.from_default_spec()

# 初始化虚拟机，注入系统指令和工具
vm = VirtualMachine(system_prompt=spec.load_system_prompt(), registry=registry)

# 调用一个工具，例如执行一个 shell 命令
result = vm.call_tool("mshtools-shell", command="echo hello from OKCVM!")

# 打印工具执行的输出
print(result.output)
# > hello from OKCVM!
```

#### 3. 运行测试 (Run Tests)

在部署或扩展工具集之前，请务必运行测试以确保一切正常。

```bash
pytest
```

## 🌐 启动 Web 控制面板 (Web Orchestrator)

OKCVM 内置了一个功能齐全的 Web 应用，让你通过图形界面与智能体交互和配置。

#### 1. 启动服务 (Start the Service)

```bash
python -m okcvm.server
```
服务将在 `http://localhost:8000` 启动。

#### 2. 打开用户界面 (Open the UI)

在浏览器中访问: **[http://localhost:8000/ui/](http://localhost:8000/ui/)**

<div align="center">
  <em>OKCVM Web 控制面板界面</em>
</div>

#### 3. 配置模型端点 (Configure Model Endpoints)

首次访问时，UI 会引导你进行配置。

1.  在 "模型配置" 表单中，填入你的模型服务信息、API Base URL 和 API Keys。
2.  OKCVM 支持配置以下类型的模型：
    -   **聊天补全 (Chat Completions)**: 核心对话模型。
    -   **图像生成 (Image Generation)**: 用于创建图片。
    -   **文本转语音 (Text-to-Speech)**: 用于生成音频。
    -   **音效合成 (Sound-Effect Synthesis)**: 用于生成音效。
    -   **自动语音识别 (ASR)**: 用于语音输入。
3.  点击 **保存配置**。
    *   *安全提示*: 你的凭证仅在服务的内存中处理，API Keys 永远不会回传到浏览器。每次修改配置时都需要重新输入。

#### 4. 开始聊天 (Start Chatting)

配置完成后，你就可以在聊天界面中与智能体进行交互了！所有消息都会被发送到后端的虚拟机进行处理，并返回精心编排的预览和结果。

---

我们很高兴你能加入这个项目！无论是贡献代码、提出建议还是报告问题，我们都非常欢迎。让我们一起构建下一代智能体工作流的未来！

<p align="right"><a href="#top">🔼 返回顶部</a></p>
