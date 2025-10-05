# 会话与对话接口

该组接口负责管理单个 `client_id` 对应的会话生命周期、消息往返、文件上传以及历史记录。除特殊说明外，所有接口均返回 JSON 响应。

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
  - `uploads`：当前会话已登记的上传文件列表（结构见“上传文件结构”）。
  - `upload_limit` / `max_upload_size_mb` / `max_upload_size_bytes`：单会话上传数量与单文件大小上限（默认 100 个、100 MB）。

## GET `/api/session/files`
列举会话已保存的上传文件。

- **请求体**：无。
- **响应体**：
  ```json
  {
    "files": [UploadEntry, ...],
    "limit": 100,
    "max_file_size_mb": 100,
    "max_file_size_bytes": 104857600
  }
  ```
  - `UploadEntry` 结构见下文。

## POST `/api/session/files`
上传一个或多个文件至当前会话的工作区挂载目录。

- **请求体**：`multipart/form-data`，字段 `files` 为数组，每个元素为浏览器或客户端选择的文件。
- **约束**：
  - 单个会话最多保留 100 个文件。单次请求上传的文件数量加上已有的文件总数不得超过此上限。若批次内出现重复文件名也将返回 `400`。
  - 单文件大小上限 100 MB；超限时立即返回 `413` 并删除已写入的部分内容。
  - 总文件数（历史 + 本次）超过 100 时返回 `400`。
- **响应体**：
  ```json
  {
    "files": [UploadEntry, ...],
    "summaries": ["用户上传了文件 ..."],
    "system_prompt": "最新系统提示词",
    "limit": 100,
    "max_file_size_mb": 100,
    "max_file_size_bytes": 104857600
  }
  ```
  - `summaries` 为对本次新增/替换文件的自然语言摘要，可直接展示在聊天区域。
  - `system_prompt` 为刷新后的系统提示词（包含上传文件说明），可用于实时更新前端侧提示词展示。

## POST `/api/chat`
向后端发送一条用户消息并获取回复。

- **请求体**：`ChatRequest` 对象：
  - `message` *(string, required)*：用户输入的自然语言或指令。
  - `replace_last` *(boolean, default=false)*：若为 `true`，先移除上一轮用户/助手对话，再重新生成回复。
  - `stream` *(boolean, default=true)*：请求使用 Server-Sent Events 推送增量内容。仅当前端设置 `Accept: text/event-stream` 时生效，否则自动回退为一次性响应。
- **响应体**：详见“聊天响应结构”。

### 流式响应（SSE）
当 `stream=true` 且客户端接受 `text/event-stream` 时，接口会返回持续的 SSE 数据流。事件格式为 `data: {json}\n\n`，常见 `type` 值如下：

| 类型 | 描述 |
| --- | --- |
| `token` | 增量输出的文本 token，字段 `delta` 为新增字符。|
| `tool_started` | 工具调用开始，包含 `tool_name`、`invocation_id`、可选 `input`。|
| `tool_completed` | 工具调用结束。`status` 为 `success` 或 `error`，可选 `duration_ms`、`output`/`error`。|
| `final` | 对话完成，`payload` 字段即下文所述完整聊天响应（含上传限制信息）。|
| `error` | 发生异常，`message` 描述错误；收到后客户端应结束订阅。|
| `stop` | 服务器关闭流。通常紧随 `final` 或 `error`。|

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
| `tool_calls` | `array` | 本轮对话期间触发的工具调用详情，详见下文。|
| `uploads` | `array` | 当前登记的上传文件列表（`UploadEntry`）。|
| `upload_limit` / `max_upload_size_mb` / `max_upload_size_bytes` | `integer` | 冗余返回的上传限制信息，便于前端同步提示。|

### 工具调用详情结构

`tool_calls` 数组中的每一项都会记录一条工具执行记录，便于前端或调用方调试：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `step` | `integer` | 工具调用在本轮对话中的顺序（从 `1` 开始）。|
| `tool_name` | `string` | LangChain/注册表中声明的工具名称。|
| `tool_input` | `object \| string \| null` | 模型传给工具的原始参数。具体类型由工具定义。|
| `tool_output` | `object \| string \| null` | 工具返回值的原始内容。为字符串时通常是 JSON 序列化文本。|
| `payload` | `object \| null` | 当工具由注册表直接执行时，记录标准化的 `{"output", "data"}` 结构；LangChain 中间步骤无此字段。|
| `source` | `string` | 调用来源，常见取值为 `"langchain"` 或 `"registry"`。|
| `invocation_id` | `string` | 服务端生成的调用唯一标识，便于与日志或工作区记录关联。|
| `log` | `string \| null` | LangChain 动作提供的原始日志信息（若存在）。|

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
  - `uploads`：重建后的上传文件列表（通常为空）。
  - `upload_limit` / `max_upload_size_mb` / `max_upload_size_bytes`：上传约束信息。

## 上传文件结构

`UploadEntry` 记录当前会话已知的每个文件：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `name` | `string` | 上传时的文件名，批次内必须唯一。|
| `relative_path` | `string` | 工作区内部的相对路径（默认等于文件名）。|
| `path` | `string` | 挂载目录下的绝对路径，适合在调试界面展示。|
| `display_path` | `string` | 去掉前导斜杠后的可展示路径。|
| `size_bytes` | `integer` | 文件大小（字节）。|
| `size_display` | `string` | 人类可读的文件大小（B/KB/MB）。|

## 工作区状态结构
多个接口会返回 `workspace_state` 字段，其结构如下：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `enabled` | `boolean` | 是否启用 Git 快照。未启用时 `snapshots` 始终为空。|
| `snapshots` | `array` | 最近快照列表，每项包含 `id`（Git 提交哈希）、`label`（提交信息）、`timestamp`（ISO 字符串）。|
| `latest_snapshot` | `string` | （可选）最近一次快照的提交哈希。当接口调用创建或恢复快照时会返回。|
| `paths` | `object` | （可选）工作区挂载路径、输出目录、内部根目录、部署目录等详细信息。|
| `git` | `object` | （可选）Git HEAD、是否有未提交更改等元数据。|

## 补充说明
- 服务器会在每次对话结束后尝试生成一次工作区快照，并在响应中返回最新快照 ID，便于前端同步状态。
- 所有响应中出现的 URL 都已根据客户端标识补全，前端直接使用即可维持隔离的工作区访问。
- 建议前端在处理 SSE 流时，同时监听 `final` 与 `stop` 事件，确保在错误情况下正确重置 UI 状态。
