# OKC Orchestrator 接口总览

本文档面向希望集成 OK Computer Orchestrator 后端的前端或第三方客户端开发者，概述所有 HTTP 接口的通用约定，并指引您阅读更细化的接口说明文档。

## 传输协议与基础路径
- 所有接口均通过 HTTP(S) 暴露，默认服务根路径为 FastAPI 应用的根目录。
- 除静态页面与部署产物外，API 均返回 `application/json` 响应体，采用 UTF-8 编码。流式对话接口会返回 `text/event-stream`。
- 服务默认允许跨域访问（CORS `Access-Control-Allow-Origin: *`），无需额外配置即可在浏览器端直接请求。

## 客户端标识（`client_id`）
后端会为每一个逻辑会话维护独立的工作空间、上传文件、历史记录及部署产物。服务器通过以下优先级解析客户端标识：
1. 显式定义在路由参数或查询参数中的 `client_id`（FastAPI 自动解析）。
2. HTTP 头 `x-okc-client-id`。
3. Cookie `okc_client_id`。
4. 查询字符串中的 `client_id`（作为兜底检查）。
5. 默认值 `default`。

客户端可任选一种方式传递标识，推荐在浏览器环境下使用 Cookie，并在需要跨标签共享状态时使用 HTTP 头。所有接口返回的 URL 字段（如网页预览、工件下载、部署资源等）都会自动补全 `client_id` 查询参数，以便前端在同一会话上下文内继续访问。

> 具体解析逻辑、工作空间查找流程详见 `src/okcvm/api/main.py` 与 `src/okcvm/session.py` 的实现。

## 响应约定
- 成功响应返回 2xx 状态码，正文为 JSON 对象或数组，除流式聊天外均一次性返回。
- 失败响应返回 4xx/5xx，并包含 `{"detail": "<错误说明>"}` 结构。
- `/api/chat` 支持基于 Server-Sent Events (SSE) 的流式推送：事件主体为 JSON 对象，包含 `type` 字段（如 `token`、`tool_started`、`tool_completed`、`final`、`error`、`stop`）。前端需设置 `Accept: text/event-stream` 才会进入流模式。
- 部署相关接口会直接返回静态文件内容，可能出现 HTML、JS、图片或二进制流。

## 文件上传约束
- 单个客户端最多保留 100 个上传文件；超过限制会返回 `400`。
- 单文件体积上限 100 MB，超过后立即中断上传并返回 `413`。
- 所有上传接口都会回传 `limit`、`max_file_size_mb`、`max_file_size_bytes`，便于前端同步提示。

## 鉴权
当前版本未启用鉴权。若部署在公共环境，建议在反向代理层补充访问控制或 IP 白名单。

## 分类文档
- [`configuration.md`](configuration.md)：运行时模型、媒体端点配置读取与更新。
- [`session.md`](session.md)：会话信息、对话消息、流式聊天、文件上传与历史管理。
- [`workspace.md`](workspace.md)：工作区快照的列举、创建与恢复。
- [`deployments.md`](deployments.md)：静态部署产物与预览资源的访问规则。
- [`conversations.md`](conversations.md)：多会话树的持久化读写与清理。

阅读以上文档前，请先完成 `client_id` 约定、错误处理策略与文件上传限制的接入，以便正确维护前端状态。
