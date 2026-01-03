<div align="center">

<a id="top"></a>

# OK Computer Virtual Machine (OKCVM)

### ✨ OK Computer in a Box: Your Self-Hosted Agent Workflow Layer ✨

</div>

<div align="center">

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
- **💾 会话持久化**: 对话树与工作区元数据会保存到 MySQL 兼容数据库，支持基于令牌的多账户访问和恢复。

## 🖥️ 桌面客户端（推荐）

> **✨ 主要操作界面**：OKCVM 桌面客户端现在是我们推荐的与智能体交互的方式。它提供了原生、流畅的体验，并内置了后端集成。

桌面客户端是一个跨平台的 Electron 应用程序，它将 Python 后端与原生用户界面打包在一起：

- **🚀 零配置** - 无需手动设置后端，开箱即用。
- **🌐 跨平台** - 支持 macOS、Windows 和 Linux 的原生构建。
- **🖥️ 原生体验** - 系统托盘集成、全局快捷键和原生通知。
- **🔄 自动更新** - 内置更新器，保持最新版本。
- **🌙 深色模式** - 自动跟随系统主题。
- **📁 文件集成** - 原生文件对话框和拖放支持。

### 快速开始（桌面客户端）

1. **下载** 适合你平台的最新版本，访问 [GitHub Releases](https://github.com/kexinoh/free-OKC/releases)
2. **安装** 应用程序（macOS 使用 DMG，Windows 使用 NSIS 安装程序，Linux 使用 AppImage/DEB）
3. **启动** OKCVM，从应用程序文件夹或开始菜单打开
4. **配置** 设置面板中的模型端点
5. **开始聊天**，与你的自托管智能体交互！

有关开发环境设置和从源代码构建的信息，请参阅 [Desktop README](desktop/README.md)。

## 📂 项目结构 (Repository Structure)

```
.
├── spec/                # 📜 系统指令和工具规范文件
├── src/okcvm/           # 🐍 虚拟机、工具注册表和工具实现的 Python 源代码
├── frontend/            # 🎨 由 FastAPI 托管的静态运维控制台
├── desktop/             # 🖥️ 跨平台 Electron 桌面应用程序
├── docs/                # 🧭 架构、后端、前端等深入文档
├── tests/               # 🧪 用于验证工具和注册表行为的自动化测试套件
├── roadmap.md           # 🗺️ 项目发展路线图 (英文)
├── roadmap.zh.md        # 🗺️ 项目发展路线图 (中文)
├── security.md          # 🔐 部署安全与加固建议
└── config.yaml          # ⚙️ CLI 与 API 可直接加载的示例运行配置
```

## 🛠️ 开发环境搭建与 API 使用

适用于希望集成 OKCVM 或为项目做出贡献的开发者。**普通用户请使用上面的桌面客户端。**

#### 1. 克隆与安装 (Clone & Install)

```bash
git clone https://github.com/kexinoh/free-OKC.git
cd free-OKC

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
# 在执行过 `pip install -e .[dev]` 之后
okcvm-server
```
这个命令行入口与 `cd src & python -m okcvm.server` 使用同一个 Typer 应用，
因此无需再切换目录，直接在项目根目录即可启动服务，默认地址为
`http://localhost:8000`。

> **Windows 常见问题排查**
>
> 如果在 PowerShell 中执行 `python -m okcvm.server` 出现
> `ModuleNotFoundError: No module named 'okcvm'`，通常说明当前用于启动服务
> 的解释器与安装 `okcvm` 的解释器不一致。请确认已激活虚拟环境，
> 可在 PowerShell 中运行 `.\venv\Scripts\Activate.ps1`。激活后，命令行提示符应包含环境名称（例如 `(free-OKC)`）。若仍然报
> 错，可以在项目根目录重新以可编辑模式安装，确保在当前环境中注册
> `okcvm-server` 命令：
>
> ```powershell
> pip install -e .
> okcvm-server
> ```
>
> 检查解释器无误后，也可以继续使用 `python -m okcvm.server` 来启动服务。

#### 2. 打开用户界面 (Open the UI)

在浏览器中访问: **[http://localhost:8000/ui/](http://localhost:8000/ui/)**

<div align="center">
    <img width="2893" height="1921" alt="image" src="https://github.com/user-attachments/assets/2b1da3b3-762a-4e39-a356-879f3e782740" />
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

#### 5. 并发与多用户访问 (Concurrency & Multi-User Access)

FastAPI 层会按 `client_id` 创建独立的 `SessionState`。浏览器首次访问时会把该标识写入 cookie 与 `localStorage`，从而自动获得隔离的对话与工作区；同一客户端的多个标签页仍会共享状态。 [`src/okcvm/api/main.py`](src/okcvm/api/main.py) [`frontend/utils.js`](frontend/utils.js)

若要接入企业账号体系，可在每次请求时解析登录态并通过 `client_id` 查询参数或 `x-okc-client-id` 请求头传入。也可以使用 [`SessionStore`](src/okcvm/api/main.py#L94-L149) 预先分配共享会话，以便协作成员共同查看同一工作区。

#### 6. 常见工具错误排查 (Troubleshooting Tool Errors)

- **会话工作区路径 (Session workspace paths)**：每次会话都会自动分配一个随机的虚拟挂载路径，例如 `/mnt/okcvm-12ab34cd/`。`mshtools-write_file`、`mshtools-read_file` 和 `mshtools-edit_file` 会自动将相对路径映射到该工作区，因此可以直接写入 `resume-website/index.html` 等相对路径；如果传入的路径不在当前会话的挂载目录下，工具会提示路径越界错误。当前会话的真实文件将被保存在后端临时目录中，互不干扰。
- **状态快照 (State snapshots)**：工作区默认由 Git 管理。系统会在每次助手回复后自动创建快照，并提供 API 让你查看快照列表或一键回滚到之前的版本，长链路协作时出错也能快速恢复。

---

我们很高兴你能加入这个项目！无论是贡献代码、提出建议还是报告问题，我们都非常欢迎。让我们一起构建下一代智能体工作流的未来！

<p align="right"><a href="#top">🔼 返回顶部</a></p>
