# 会话树存储接口

该组接口用于在后端数据库中持久化保存多个对话树（Conversation Graph），便于前端在不同项目之间切换、归档或恢复工作区。所有路由均位于 `/api/conversations` 前缀下，且必须携带有效的 `client_id`。

> 存储后端基于 SQLAlchemy，默认使用 `sqlite:///okcvm_conversations.db` 数据库文件，可通过环境变量 `OKCVM_DB_URL` 等调整。每位客户端的会话彼此隔离。

## 通用负载结构

- `ConversationPayload` 是一个可扩展的字典，至少包含：
  - `id` *(string, required)*：会话唯一标识。
  - `title` *(string, optional)*：展示名称，未提供时服务端会填充“新的会话”。
  - `createdAt` / `updatedAt` *(string, ISO-8601 可选时区)*：时间戳，缺省时后端将使用当前时间。
  - `messages` *(array, optional)*：前端自定义的消息或节点结构。
  - `branches` / `outputs` *(object, optional)*：用于保存多分支对话或渲染结果。
  - `workspace` *(object, optional)*：最近关联的工作区信息，推荐包含：
    - `paths.mount`、`paths.internal_root`、`paths.session_id`：用于定位文件与部署目录。
    - `git.commit`、`git.is_dirty`：Git 快照状态。
- 后端会原样存储 `messages`、`branches`、`outputs` 等字段，仅对 `id`、`title`、时间戳及 `workspace` 的关键字段做归一化处理。

所有写操作 (`POST`/`PUT`) 接口都会返回经过归一化后的完整 `conversation` 对象；读取接口则返回一个包含 `conversations` 数组的对象。

## GET `/api/conversations`

列举当前 `client_id` 下的所有会话树，按更新时间倒序排序。

- **查询参数**：
  - `client_id` *(string, optional)*：如果未提供，将按[总览文档](README.md#客户端标识client_id)所述从请求头或 Cookie 推断。
- **响应体**：
  ```json
  {
    "conversations": [ConversationPayload, ...]
  }
  ```
  后端会确保响应对象中至少包含 `id`、`title`、`createdAt`、`updatedAt`，并补齐 `workspace.paths`、`workspace.git` 中缺失的关键字段。

## POST `/api/conversations`

创建一条新的会话记录。若 `id` 已存在，将覆盖旧内容。

- **请求体**：`ConversationPayload`。
- **响应体**：
  ```json
  {
    "conversation": ConversationPayload
  }
  ```
- **注意事项**：
  - 若 `createdAt` 缺省，服务器会使用当前时间；`updatedAt` 亦然。
  - 当请求体未提供 `title` 或为空字符串时，将被替换为“新的会话”。
  - 后端会持久化 `workspace.paths.internal_root` 等字段，便于后续清理部署目录。

## PUT `/api/conversations/{conversation_id}`

根据路径参数强制写入指定 ID 的记录，可用于“另存为”或从前端同步最新状态。

- **路径参数**：`conversation_id` *(string)* 会覆盖请求体中的 `id`。
- **请求体**：`ConversationPayload`（可选包含 `id`，最终以路径参数为准）。
- **响应体**：同 `POST`。
- **错误处理**：若请求体缺少必填字段会返回 `400`；当试图覆盖不同 `client_id` 的记录时会返回 `500` 并记录日志（用于防御非法跨租户访问）。

## DELETE `/api/conversations/{conversation_id}`

删除指定会话，并尝试清理其关联的内部工作区目录及部署产物。

- **响应体**：
  ```json
  {
    "deleted": true,
    "workspace": {
      "removed": true,
      "path": "/abs/path/to/workspace",
      "deployments_removed": ["/abs/path/to/deployment"],
      "error": "..." // 可选
    }
  }
  ```
  - 当记录不存在或 `client_id` 不匹配时返回 `404`，`detail` 为 `"Conversation not found"`。
  - `workspace.removed` 指示本地目录是否成功删除；若存在部署目录，也会尝试清理并将路径列于 `deployments_removed`。
  - 若工作区路径不合法或删除失败，将在 `workspace.error` 中返回诊断信息。

## 前端集成建议
- 在加载应用时先调用 `GET /api/conversations`，按需恢复 `workspace` 字段中的快照或挂载路径。
- 每次会话保存后，将服务端返回的 `conversation.workspace.paths` 回写到内存中，以便下次上传或部署时自动关联。
- 删除会话后请刷新工作区视图；若 `workspace.deployments_removed` 不为空，可同步清理对应的部署列表。
- 如果需要高并发访问非 SQLite 数据库，可通过环境变量配置连接池大小 (`OKCVM_DB_POOL_SIZE`) 与 SQL 日志 (`OKCVM_DB_ECHO`)。
