# 路线图

## 已实现的能力

### 系统提示词与工具规范打包
项目仍然随包提供 OK Computer 的系统提示词和工具清单，方便集成方开箱即用。
- `okcvm.spec` 提供数据类与加载辅助函数，读取内置的 `system_prompt.md` 和
  `tools.json` 并返回结构化规范供下游消费。([`src/okcvm/spec.py`](./src/okcvm/spec.py))

### 基于 LangChain 的虚拟机运行时
我们用真实的 LangChain 工具调用代理替换了早期的桩实现，让会话可以路由到
可配置的聊天模型并驱动所有工具。
- `okcvm.llm.create_llm_chain` 将 LangChain 的 `ChatOpenAI` 客户端与注册表中的
  工具绑定，构建遵循历史上下文的工具调用模板。([`src/okcvm/llm.py`](./src/okcvm/llm.py))
- `okcvm.vm.VirtualMachine` 负责把内部历史转成 LangChain 消息、执行代理、记录
  中间工具调用并维护可追踪的执行日志。([`src/okcvm/vm.py`](./src/okcvm/vm.py))

### 运行时配置与 CLI 体验
我们新增了线程安全的配置层、YAML/环境变量加载能力以及 Typer CLI，运维人员
无需改代码即可管理各类推理端点。
- `okcvm.config` 提供聊天与多媒体端点的数据类、环境变量/YAML 加载器以及
  原子更新方法，为 API 与运行时提供统一来源。([`src/okcvm/config.py`](./src/okcvm/config.py))
- 顶层 `main.py` 暴露启动服务、校验配置、列出工具的命令，同时完成依赖检查
  与环境加载。([`main.py`](./main.py))

### 可观测性与 HTTP 接入层
编排服务现在默认输出结构化日志与请求链路，便于排查线上问题。
- `okcvm.logging_utils` 配置 Rich 控制台输出与滚动文件日志，`okcvm.api.main`
  则在 FastAPI 之上增加请求日志中间件并挂载前端资源。([`src/okcvm/logging_utils.py`](./src/okcvm/logging_utils.py)、
  [`src/okcvm/api/main.py`](./src/okcvm/api/main.py))

### 会话管理与对话工作流
Session 层不再使用静态示例，所有请求都会通过 VM，返回的工具元数据驱动 UI
生成更丰富的预览。
- `okcvm.session.SessionState` 负责串联注册表、VM 与配置，向前端回传工具摘要、
  模型指标和预览内容。([`src/okcvm/session.py`](./src/okcvm/session.py))
- `/api/session/*` 与 `/api/chat` 路由提供启动、查询与聊天接口，对输入做裁剪
  并在失败时返回明确的校验信息。([`src/okcvm/api/main.py`](./src/okcvm/api/main.py))

### 控制台前端升级
随包 UI 现已发展为集历史记录、配置面板与多模态预览于一体的工作台。
- `frontend/index.html` 新增历史侧栏、配置抽屉以及聊天记录、网页预览、幻灯
  预览等信息面板。
- `frontend/app.js` 与后端同步配置、使用 localStorage 缓存会话、处理辅助功能
  快捷键，并在工具输出抵达时刷新预览区。

### 完整的回归测试
单元测试覆盖 API、配置助手、LangChain 链路与工具注册表，保障后续改动安全。
- `tests/` 目录验证 FastAPI 应用、配置加载逻辑、LangChain 集成以及各工具实现。

## 规划与进行中的工作

### 更丰富的工具输出渲染
工具返回的数据仍需统一适配，以便前端无需手动解析即可展示网页与 PPT 资源。
- 设计网页/幻灯素材的标准 schema，并扩展 `SessionState.respond` 自动生成预览。

### 流式与多轮体验
当前代理同步执行，只返回最终回答。
- 评估 LangChain 的流式回调，把增量回复与工具进度推送给前端。
- 在服务端持久化会话历史，支持刷新或多终端共享上下文。

### 扩展媒体与部署集成
目前仅有部分 OK Computer 媒体端点具备参考实现。
- 持续补充语音、音效、部署等参考集成，并统一凭据与限流管理。

### 高阶浏览器自动化
HTTP 抓取器仍然是轻量实现。
- 在保留用于测试和离线模式的确定性爬虫的前提下探索 Playwright/Selenium 后端，并提供资源限制选项。

### 发布与分发
希望让运维无需克隆仓库即可体验。
- 打包包含 CLI、API 与前端资源的容器镜像与 PyPI 发行版，并提供默认配置。
