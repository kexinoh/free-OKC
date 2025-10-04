# OKC Orchestrator 接口总览

本文档面向希望集成 OK Computer Orchestrator 后端的前端或第三方客户端开发者，概述所有 HTTP 接口的通用约定，并指引您阅读更细化的接口说明文档。

## 传输协议与基础路径
- 所有接口均通过 HTTP(S) 暴露，默认服务根路径为 FastAPI 应用的根目录。
- 除静态页面与部署产物外，API 均返回 `application/json` 响应体，采用 UTF-8 编码。
- 服务默认允许跨域访问（CORS `Access-Control-Allow-Origin: *`），无需额外配置即可在浏览器端直接请求。

## 客户端标识（`client_id`）
后端会为每一个逻辑会话维护独立的工作空间与历史记录。服务器通过以下优先级解析客户端标识：
1. 显式传入的查询参数 `client_id`
2. HTTP 头 `x-okc-client-id`
3. Cookie `okc_client_id`
4. 查询参数 `client_id`
5. 默认值 `default`

客户端可任选一种方式传递标识，推荐在浏览器环境下使用 Cookie，并在需要跨标签共享状态时使用 HTTP 头。所有会返回带链接的字段（如预览地址、工件下载地址）都会自动补全 `client_id` 查询参数，以便前端在同一会话上下文内继续访问。

> 具体解析逻辑、工作空间查找流程详见 `src/okcvm/api/main.py` 与 `src/okcvm/session.py` 的实现说明。

## 响应约定
- 成功响应返回 2xx 状态码，正文为 JSON 对象或数组。
- 失败响应返回 4xx/5xx，并包含 `{"detail": "<错误说明>"}` 结构。
- 少部分接口（部署静态文件）会返回二进制资源或触发 404/400 错误。

## 鉴权
当前版本未启用鉴权。若部署在公共环境，建议在反向代理层补充访问控制或 IP 白名单。

## 分类文档
- [`configuration.md`](configuration.md)：运行时模型、媒体端点配置读取与更新。
- [`session.md`](session.md)：会话信息、对话消息、历史检索与重置。
- [`workspace.md`](workspace.md)：工作区快照的列举、创建与恢复。
- [`deployments.md`](deployments.md)：静态部署产物与预览资源的访问规则。

阅读以上文档前，请先完成 `client_id` 约定与错误处理策略的接入，以便正确维护前端状态。
