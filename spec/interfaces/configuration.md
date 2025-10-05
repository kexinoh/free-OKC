# 配置管理接口

用于在运行时读取和更新后端所连接的大模型与多媒体服务端点。所有接口均位于 `/api/config` 路径。

## GET `/api/config`
读取当前生效的配置。

- **请求方式**：`GET`
- **请求体**：无
- **响应体**：JSON 对象，字段含义如下：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `chat` | `object \| null` | 聊天模型端点描述，未配置时为 `null`。包含 `model`、`base_url`、`supports_streaming` 以及（可选）`api_key_present`。|
| `image` | `object \| null` | 图像生成模型端点描述。结构同上。|
| `speech` | `object \| null` | 语音合成端点描述。|
| `sound_effects` | `object \| null` | 音效端点描述。|
| `asr` | `object \| null` | 语音识别端点描述。|

端点描述对象由 [`ModelEndpointConfig.describe()`](../../src/okcvm/config.py) 底层实现提供，若保存了 API Key，会额外返回 `api_key_present: true`，但不会泄露明文。

## POST `/api/config`
整体更新所有或部分配置段。

- **请求方式**：`POST`
- **请求体**：JSON 对象，对应 [`ConfigUpdatePayload`](../../src/okcvm/api/models.py)；任意字段缺省表示保持当前值。

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `chat` | `object \| null` | （可选）聊天模型配置。字段为 `model`、`base_url`、`api_key`、`supports_streaming`。显式提交 `null` 或者 `model`/`base_url` 为空字符串会清除该段配置。|
| `image` | `object \| null` | （可选）图像生成端点配置。结构同上。|
| `speech` | `object \| null` | （可选）语音合成端点配置。|
| `sound_effects` | `object \| null` | （可选）音效端点配置。|
| `asr` | `object \| null` | （可选）语音识别端点配置。|

> **提示**：服务器会在日志中打点更新内容，并在返回体中隐藏任何明文 API Key，方便审计同时避免泄漏。

- **部分更新规则**：
  1. 仅当请求体显式携带对应字段时才会修改该段配置；缺省字段会沿用现有值。
  2. `api_key` 字段留空或缺省时，服务器会继续沿用已保存的密钥；若希望清除密钥，请显式传入空字符串。
  3. `supports_streaming` 缺省时会沿用旧值，方便只更新模型/地址而不影响流式能力开关。
  4. 端点对象中缺少 `model` 或 `base_url` 会被视为删除该段配置。

- **响应体**：同 `GET /api/config`。
- **错误码**：当字段缺失或值非法导致配置更新失败时返回 `400 Bad Request`，`detail` 字段包含失败原因。

## 使用建议
1. 调用 `POST /api/config` 时仅提交需要更新的段落，其余字段省略可避免覆盖现有配置。
2. 在 Web 管理端中记录最后一次成功写入的版本，并在失败时回滚 UI。
3. 若部署在无状态服务中，请自行持久化配置（例如写入磁盘或配置中心），确保实例重启后可以通过同一路径重新写入。
4. 当启用 SSE 聊天时，请确保至少有一个配置了 `supports_streaming: true` 的聊天模型端点。
