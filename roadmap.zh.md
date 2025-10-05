# 路线图

## 已实现的能力

### 流式运行时与操作反馈
- `/api/chat` 现已支持服务端推送流式输出，实时传递增量文本、工具执行状态和最终结果。
  这一链路由 `LangChainStreamingHandler`、事件发布器和前端流式控制器共同驱动。
  [src/okcvm/api/main.py#L705-L781](./src/okcvm/api/main.py#L705-L781)
  [src/okcvm/streaming.py#L33-L165](./src/okcvm/streaming.py#L33-L165)
  [frontend/app/streamingController.js#L1-L183](./frontend/app/streamingController.js#L1-L183)
- `SessionState.respond` 会将模型摘要、工具日志和预览元数据一并返回，
  前端的 `previews.js` 负责把这些信息渲染成时间线和可视化卡片。
  [src/okcvm/session.py#L277-L519](./src/okcvm/session.py#L277-L519)
  [frontend/previews.js#L1-L200](./frontend/previews.js#L1-L200)

### 会话持久化
- 基于 SQLAlchemy 的 `ConversationStore` 保存完整对话、工作区信息以及部署产物，
  浏览器刷新后可直接恢复上下文，同时在删除时清理对应的沙箱目录。
  [src/okcvm/storage/conversations.py#L81-L318](./src/okcvm/storage/conversations.py#L81-L318)
- REST 接口和前端的持久化调度器负责异步更新、删除对话条目，保证交互顺畅。
  [src/okcvm/api/main.py#L525-L580](./src/okcvm/api/main.py#L525-L580)
  [frontend/conversationState.js#L612-L810](./frontend/conversationState.js#L612-L810)

### 工作区上传与系统提示优化
- 控制台支持直接上传参考文件，后端限制文件数量与大小并写入沙箱，
  同时将摘要拼接进系统提示，帮助模型理解上下文。
  [src/okcvm/api/main.py#L616-L703](./src/okcvm/api/main.py#L616-L703)
  [src/okcvm/session.py#L96-L157](./src/okcvm/session.py#L96-L157)
  [frontend/app/index.js#L171-L302](./frontend/app/index.js#L171-L302)

### 前端模块化
- `app/index.js` 现在串联布局、流式、上传、配置、对话持久化等模块，
  `conversationState.js` 则承担分支管理和后端同步，结构更加清晰易扩展。
  [frontend/app/index.js#L1-L947](./frontend/app/index.js#L1-L947)
  [frontend/conversationState.js#L1-L810](./frontend/conversationState.js#L1-L810)
- `utils.js` 统一管理 `client_id`、流式解析与错误处理，新功能可以直接复用。
  [frontend/utils.js#L136-L288](./frontend/utils.js#L136-L288)

### 测试保障
- 新增的 `test_streaming.py`、`test_storage_conversations.py` 与工作区用例
  让流式回调、会话持久化和沙箱逻辑都具备回归测试覆盖。
  [tests/test_streaming.py#L1-L110](./tests/test_streaming.py#L1-L110)
  [tests/test_storage_conversations.py#L1-L132](./tests/test_storage_conversations.py#L1-L132)
  [tests/test_workspace.py#L1-L74](./tests/test_workspace.py#L1-L74)

## 进行中的工作

### 富媒体预览
继续扩展工具返回的元数据，包括缩略图、幻灯片清单、音频描述等，
让前端无需解析 HTML 即可渲染更丰富的预览。
[src/okcvm/session.py#L277-L519](./src/okcvm/session.py#L277-L519)
[frontend/previews.js#L200-L328](./frontend/previews.js#L200-L328)

### 协作与留存策略
在持久化能力基础上，设计跨会话协作与分享：支持留存策略、显式分享流程、
以及导入导出，方便团队协同。
[src/okcvm/storage/conversations.py#L81-L318](./src/okcvm/storage/conversations.py#L81-L318)
[frontend/conversationState.js#L612-L810](./frontend/conversationState.js#L612-L810)

### 发布与分发
打包 CLI、FastAPI 服务与前端静态资源，提供容器镜像与 Python Wheel，
让运维无需克隆仓库即可部署。
[src/okcvm/server.py#L1-L88](./src/okcvm/server.py#L1-L88)
[pyproject.toml#L1-L40](./pyproject.toml#L1-L40)

## 后续探索

- **高级浏览器自动化**：在保留轻量抓取器的同时探索 Playwright/Selenium 后端，
  并提供资源隔离策略。
- **媒体集成**：持续补充语音、音效、ASR 等参考工具，统一凭据与限流管理。
- **可观测性导出**：将结构化日志、工作区事件推送到 OpenTelemetry，
  便于与外部系统关联分析。
