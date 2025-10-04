# 会话与对话接口

该组接口负责管理单个 `client_id` 对应的会话生命周期、消息往返以及历史记录。

## GET `/api/session/info`
返回会话当前的虚拟机（VM）上下文信息。

- **请求体**：无。
- **响应体**：`VirtualMachine.describe()` 输出，字段如下：
  - `system_prompt`：当前系统提示词。
  - `tools`：可用工具名称数组。
  - `history_length`：历史消息条目数量。
  - `workspace_id` / `workspace_mount` / `workspace_output`：存在工作区时提供的会话挂载路径信息。
  - `history_namespace`：用于构造消息 ID 的命名空间前缀。

## GET `/api/session/boot`
初始化或获取当前会话的欢迎信息。

- **请求体**：无。
- **响应体**：对象包含：
  - `reply`：欢迎文案。
  - `meta`：参见下文“聊天响应结构”。
  - `web_preview`：默认欢迎页 HTML 片段。
  - `ppt_slides`：示例幻灯片数组。
  - `artifacts`：空数组，占位。
  - `vm`：等同于 `GET /api/session/info` 的结果。
  - `workspace_state`：见下文“工作区状态结构”。

## POST `/api/chat`
向后端发送一条用户消息并获取回复。

- **请求体**：`ChatRequest` 对象：
  - `message` *(string, required)*：用户输入的自然语言或指令。
  - `replace_last` *(boolean, default=false)*：若为 `true`，先移除上一轮用户/助手对话，再重新生成回复。
- **响应体**：详见“聊天响应结构”。

### 聊天响应结构
`session.respond()` 会统一返回如下字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `reply` | `string` | 助手文本答复。发生错误时为回退文案。|
| `meta` | `object` | 元信息，包括 `model`（当前聊天模型）、`timestamp`（服务端时间）、`tokensIn`、`tokensOut`、`latency`、`summary`（来自工具输出或空字符串）。|
| `web_preview` | `object \| null` | 当工具产生网页预览或部署链接时，会包含 `html`、`url`、`deployment_id`、`title` 等字段。若不存在预览则为 `null`。所有 URL 会自动附带 `client_id`。|
| `ppt_slides` | `array` | 解析工具输出中幻灯片数据得到的 `{title, bullets}` 数组，没有时为空。|
| `artifacts` | `array` | 工件列表，每项含 `type`、`name`、`url`。若响应包含网页预览，列表中也会追加对应条目。|
| `vm_history` | `array` | 最近 25 条会话历史记录，条目包含 `id`、`role` (`user`/`assistant`/`tool`)、`content` 及（对工具）额外字段。可传给 `GET /api/session/history/{entry_id}` 深入查看。|
| `workspace_state` | `object` | 当前工作区快照状态摘要，结构见下文。|

## GET `/api/session/history/{entry_id}`
按 ID 读取某条历史记录。

- **请求体**：无。
- **响应体**：单条历史字典，与 `vm_history` 中的条目一致。
- **错误码**：不存在时返回 `404`，`detail: "History entry not found"`。

## DELETE `/api/session/history`
清空会话历史并删除关联工作区内容。

- **请求体**：无。
- **响应体**：
  - `history_cleared`：恒为 `true`。
  - `cleared_messages`：被删除的历史消息数量。
  - `workspace`：工作区清理摘要，包含挂载路径、内部目录、`removed`（布尔值）以及当存在部署清理时的 `deployments` 统计。
  - `vm`：新的 VM 描述信息。

## 工作区状态结构
多个接口会返回 `workspace_state` 字段，其结构如下：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `enabled` | `boolean` | 是否启用 Git 快照。未启用时 `snapshots` 始终为空。|
| `snapshots` | `array` | 最近快照列表，每项包含 `id`（Git 提交哈希）、`label`（提交信息）、`timestamp`（ISO 字符串）。|
| `latest_snapshot` | `string` | （可选）最近一次快照的提交哈希。当接口调用创建或恢复快照时会返回。|

## 补充说明
- 服务器会在每次对话结束后尝试生成一次工作区快照，并在响应中返回最新快照 ID，便于前端同步状态。
- 所有响应中出现的 URL 都已根据客户端标识补全，前端直接使用即可维持隔离的工作区访问。
