# 路线图

## 已实现的能力

### 系统提示与工具清单打包
我们内置上游的系统提示词和工具清单，并提供加载辅助函数，方便客户端零配置启动 OKCVM。
- `okcvm.spec` 提供数据类和加载器，读取打包在项目中的 `system_prompt.md` 与 `tools.json`，并返回结构化的工具规范供下游使用。([`src/okcvm/spec.py#L1-L57`](./src/okcvm/spec.py#L1-L57))

### 默认绑定的工具注册表
ToolRegistry 会自动把清单里的每个工具绑定到具体实现或占位桩对象，确保与规范保持一致。
- 默认构造流程会加载清单、注册所有随包提供的工具类，并为缺口注入带提示信息的桩工具，让公共 API 在规范扩展时依旧可用。【F:src/okcvm/registry.py†L25-L110】

### 虚拟机外观层
VirtualMachine 负责调度工具调用、维护最近历史，并向宿主应用暴露可序列化的描述接口。
- 每次调用都会通过注册表路由、记录参数与结果，并通过 `describe`、`describe_history`、`last_result` 等辅助方法供智能体集成使用。【F:src/okcvm/vm.py†L1-L73】

### 生产力工具链覆盖
我们实现了 OK Computer 规范中的待办、文件、Shell 与 IPython 执行工具，满足日常协作场景。
- 待办工具以 JSON 形式持久化任务，支持全量重写与追加写入，贴近上游行为。【F:src/okcvm/tools/todo.py†L1-L88】
- 文件工具强制使用绝对路径，支持二进制安全读写，并提供带保护的编辑操作，保持良好的人机体验。【F:src/okcvm/tools/files.py†L1-L93】
- Shell 与 IPython 工具支持命令输出捕获、环境重置以及 `` `!` `` 前缀的行内 Shell 指令，便于快速实验。【F:src/okcvm/tools/shell.py†L1-L32】【F:src/okcvm/tools/ipython.py†L1-L60】

### Web、媒体与部署工具
项目内置轻量的浏览模拟、搜索/媒体合成、部署与幻灯生成工具，与 OKC 规范保持一致。
- 浏览器模块提供基于 HTTP 的确定性导航、元素发现与内存态会话模型，用于脚本化探索流程。【F:src/okcvm/tools/browser.py†L1-L143】
- 搜索工具通过确定性的 HTTP 客户端封装 DuckDuckGo 的网页与图像检索接口，支持资料调研场景。【F:src/okcvm/tools/search.py†L1-L144】
- 媒体与幻灯工具可生成合成图像、语音、音效及 PPTX 文稿，使智能体无需外部服务即可完成创意任务。【F:src/okcvm/tools/media.py†L1-L200】【F:src/okcvm/tools/slides.py†L1-L74】
- 数据源与部署助手覆盖雅虎财经行情接口和静态站点发布，复刻常见的 OK Computer 工作流。【F:src/okcvm/tools/data_sources.py†L1-L96】【F:src/okcvm/tools/deployment.py†L1-L66】

### 本地控制平面与 Web 界面
我们提供基于 FastAPI 的本地服务与浏览器端操作台，让团队可以配置模型端点并通过对话驱动虚拟机。
- `okcvm.server` 负责挂载 `frontend/` 资源，开放配置、对话与 VM 检索的 REST 接口，并以确定性示例响应演示多模态流程。【F:src/okcvm/server.py†L1-L269】
- 更新后的 `frontend/` 资源可从后端读取与保存配置，通过新 API 驱动对话，并实时更新网页预览与幻灯片面板。【F:frontend/index.html†L1-L160】【F:frontend/app.js†L1-L219】
- 运行时配置新增聊天、图像、语音、音效与语音识别端点支持，默认读取环境变量，并在 HTTP 响应中隐藏 API Key 明文。【F:src/okcvm/config.py†L1-L163】

## 规划与进行中的工作

### 更高保真度的浏览器自动化
当前基于 HTTP 的抓取器刻意省略 JavaScript、多标签和复杂表单，我们计划引入无头浏览器后端以提升逼真度。【F:src/okcvm/tools/browser.py†L1-L22】
- 评估在保留测试友好的确定性模式下，引入可配置资源限制的 Playwright 或 Selenium 驱动。
- 扩展会话模型，覆盖 Cookie、本地存储与导航历史，支持带身份的工作流。

### 更丰富的数据源目录
目前数据源注册表仅包含雅虎财经报价接口，仍缺少大量上游集成能力。【F:src/okcvm/tools/data_sources.py†L22-L96】
- 新增更多行情、新闻与知识类 API，并统一序列化格式以扩大分析覆盖面。
- 引入 API 密钥与限流配置机制，满足生产部署的安全与稳定需求。

### 持续追平工具规范
注册表已为缺失实现的规范项预留桩实现，提示我们需要在规范增长时及时补齐新工具。【F:src/okcvm/registry.py†L72-L91】
- 跟踪 OK Computer 工具合同的上游变更，快速落地原生实现，避免桩响应。
- 提供贡献指南与脚手架生成器，降低社区工具开发门槛。

### 更高质量的媒体生成
现有图像和音频输出是确定性占位符，我们计划接入可选的模型管线以获得更真实的创作效果。【F:src/okcvm/tools/media.py†L37-L200】
- 评估可本地运行的轻量扩散或 TTS 引擎，以显著提升相较于哈希纹理和正弦波合成的质量。
- 制定缓存与素材管理约定，方便与后续分享类工具协同。

### 持久化的编排状态
随着浏览器工作台与后端打通，下一阶段聚焦于持久化与更强的集成能力。
- 新增可选的磁盘配置文件（如 TOML/YAML），在保证 API Key 安全的前提下支持重启后恢复端点。
- 将真实的 OKCVM 工具调用纳入对话循环，引入规划/代理逻辑并把工具历史流式反馈到界面。
- 在界面中展示端点健康状况（连通性测试、延迟采样等），帮助运维在对外开放前完成验证。
