# 工作区快照接口

工作区用于存放运行中生成的文件、部署产物及 Git 快照。下列接口均要求携带正确的 `client_id`。

## GET `/api/session/workspace/snapshots`
列举最近的快照。

- **查询参数**：
  - `limit` *(int, default=20)*：返回的快照上限。
- **响应体**：`workspace_state` 对象（详见 [session 文档](session.md#工作区状态结构)）。若启用了 Git 工作区，`workspace_state.paths` 会补充挂载目录、内部输出、部署目录等路径；`workspace_state.git` 会描述当前 HEAD 与脏状态。

## POST `/api/session/workspace/snapshots`
手动创建一个快照。

- **查询参数**：
  - `limit` *(int, default=20)*：返回时附带的快照列表长度。
- **请求体**：`SnapshotCreatePayload` 对象：
  - `label` *(string, optional)*：自定义提交信息。长度上限 200 字符。
- **响应体**：最新的 `workspace_state`，其中 `latest_snapshot` 会指向新提交。
- **错误码**：若工作区未启用快照功能，返回 `400 Bad Request`，`detail` 为 `"Workspace snapshots are disabled"`。

## POST `/api/session/workspace/restore`
将工作区回滚至历史快照。

- **查询参数**：
  - `limit` *(int, default=20)*。
- **请求体**：`SnapshotRestorePayload` 对象：
  - `snapshot_id` *(string, required)*：目标快照的 Git 提交哈希。
- **响应体**：`workspace_state`，`latest_snapshot` 指向被恢复的提交。必要时会更新 `paths`/`git` 字段以反映最新状态。
- **错误码**：
  - `400 Bad Request`：工作区未启用快照或提供的 `snapshot_id` 无效。

## 快照条目示例
当启用 Git 存储时，`snapshots` 数组中的每个对象包含：

| 字段 | 说明 |
| --- | --- |
| `id` | Git 提交哈希，用于恢复。|
| `label` | 提交信息（包含调用方设置的 `label`）。|
| `timestamp` | ISO-8601 格式的提交时间。|

可结合 `latest_snapshot` 字段在前端突出显示当前工作副本所对应的快照。
