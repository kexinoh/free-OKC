# 工作空间（Workspace）

OKCVM 为每个会话创建一个隔离的“虚拟空间”，确保工具调用和文件访问始终发生在独立的沙箱中。该机制由 `okcvm.workspace.WorkspaceManager` 驱动，并配合 Git 快照实现可回溯的状态管理。本章节详细描述工作空间的目录结构、生命周期、路径解析策略以及和会话、API 的集成方式。

## 目录结构与初始化

1. **会话挂载点**：启动时生成随机挂载名（如 `/mnt/okcvm-12ab34cd/`），并在系统临时目录下创建对应的内部根目录。内部目录包含 `mnt/`、`output/`、`tmp/` 子目录，用于分别映射公开挂载、工具输出与临时文件。【F:src/okcvm/workspace.py†L32-L89】
2. **路径快照**：所有路径被封装在 `WorkspacePaths` 数据类中，包含会话 ID、公开路径（`mount`、`output`）以及内部真实路径，方便在日志和 API 中统一引用。【F:src/okcvm/workspace.py†L168-L211】
3. **清理机制**：`WorkspaceManager.cleanup()` 会在会话结束或手动重置时递归删除内部根目录，避免跨会话污染。重复调用会被安全地忽略以保证幂等性。【F:src/okcvm/workspace.py†L228-L263】

## 路径解析与沙箱策略

- 所有用户输入的路径都会交给 `WorkspaceManager.resolve()` 处理。该方法会统一分隔符、支持相对路径，并且将所有绝对路径重新定位到当前会话的内部根目录下。如果解析结果试图逃逸根目录，会抛出 `WorkspaceError` 终止操作。【F:src/okcvm/workspace.py†L212-L227】【F:src/okcvm/workspace.py†L242-L264】
- 为了兼容旧版系统提示词，`WorkspaceManager.adapt_prompt()` 会将提示词中的历史挂载路径（`/mnt/okcomputer/`、`/mnt/okcomputer/output/`）替换为当前会话的随机挂载路径，使得代理始终感知正确的沙箱位置。【F:src/okcvm/workspace.py†L266-L281】

## Git 驱动的快照

- `GitWorkspaceState` 会在工作空间根目录下初始化 Git 仓库，并设置隔离的环境变量，确保提交不会污染系统级 Git 配置。若运行环境缺少 Git，可回退到 `_NullWorkspaceState`，此时快照功能被禁用但工作空间依旧可用。【F:src/okcvm/workspace.py†L44-L118】
- 每次创建快照会执行 `git add -A`、`git commit` 并返回最新的 commit 哈希，以便前端通过会话树引用具体节点。快照条目记录 ID、标签和时间戳，可通过 API 查询最近 N 条历史。【F:src/okcvm/workspace.py†L120-L162】
- 恢复动作会 `git reset --hard` 指定哈希并清理未跟踪文件，实现可预测的回滚能力；若传入未知哈希，系统会抛出 `WorkspaceStateError` 并阻止恢复。【F:src/okcvm/workspace.py†L156-L167】

## 会话生命周期中的挂载

1. **创建会话**：`SessionState._initialise_vm()` 调用配置层获得持久根目录，实例化 `WorkspaceManager`，并将其注入默认工具注册表，保证所有声明 `requires_workspace` 的工具自动获得沙箱上下文。【F:src/okcvm/session.py†L22-L44】
2. **响应消息**：在 `SessionState.respond()` 中，每次回复都会根据用户输入生成快照标签，调用 `workspace.state.snapshot()` 捕捉当前文件状态，并把快照摘要嵌入返回 payload 的 `workspace_state` 字段，供前端渲染会话树节点。【F:src/okcvm/session.py†L94-L150】
3. **重置与清理**：`SessionState.delete_history()` 和 `SessionState.reset()` 会先调用工作空间清理，再重新初始化 VM 与工作空间，确保旧文件不会影响新会话。【F:src/okcvm/session.py†L152-L207】

## API 与工具集成

- FastAPI 提供列出、创建、恢复快照的 REST 接口，分别映射到 `GET /api/session/workspace/snapshots`、`POST /api/session/workspace/snapshots` 与 `POST /api/session/workspace/restore`。错误会统一包装为 `WorkspaceStateError` 并以 400 返回。【F:src/okcvm/api/main.py†L187-L222】
- 所有需要文件系统的工具（如网站部署、PPT 生成等）都通过注入的 `WorkspaceManager` 解析路径，保证它们的输入输出落在当前会话目录内，并能被后续快照捕获，实现跨工具的一致状态管理。【F:src/okcvm/tools/deployment.py†L70-L116】【F:src/okcvm/tools/slides.py†L32-L73】

通过以上机制，工作空间章节保证了在多会话、多工具场景下的数据隔离、安全访问和时间旅行能力，是会话树运作的基础。
