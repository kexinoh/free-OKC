# 会话树（Session Tree）

会话树是 OKCVM 中连接“对话历史、工作空间快照、部署成果和 PPT 产物”的核心索引结构。它把一次会话视为根节点，通过快照与工件生成的节点形成分支，支持回溯、复制以及跨工具的状态追踪。本章节从数据结构、Git 管理、回退策略以及部署/PPT 协调等角度详解会话树的工作方式。

## 节点模型

1. **根节点：会话实例** – `SessionState.boot()` 在第一次请求时记录欢迎内容，并返回当前 `VirtualMachine` / `WorkspaceManager` 的描述信息。若需要重新初始化工作台，应通过 `SessionState.delete_history()` 或 `SessionState.reset()` 触发清理，再由下一次 `boot` 请求生成新的根节点元数据。【F:src/okcvm/session.py†L18-L220】
2. **对话节点：历史消息** – `VirtualMachine.record_history_entry()` 会为每条消息生成带命名空间的递增 ID（如 `okcvm-12ab34cd-0001`），确保树形结构中每个节点都有稳定引用。`/api/session/history/{entry_id}` 接口可按 ID 取回任意节点的详细内容，前端据此绘制时间轴与分支。【F:src/okcvm/vm.py†L52-L108】【F:src/okcvm/vm.py†L118-L178】【F:src/okcvm/api/main.py†L148-L182】
3. **工件节点：工具输出** – 当代理调用工具时，`VirtualMachine.call_tool()` 会把输入、输出和成功状态写入历史节点，使部署结果、PPT 文件等都成为会话树上的子节点，可被快照和回放。【F:src/okcvm/vm.py†L110-L157】

## Git 快照与分支

- `SessionState.respond()` 在生成回复后会触发 `GitWorkspaceState.snapshot()`，用用户消息摘要作为 commit 信息，返回的哈希被保存到响应的 `workspace_state` 字段中。前端会把这些哈希映射为会话树上的快照节点，允许用户在任意时间点创建分支或回滚。【F:src/okcvm/session.py†L94-L150】【F:src/okcvm/workspace.py†L120-L162】
- `SessionState.restore_workspace()` 基于用户选择的 commit 哈希执行 `git reset --hard`，同时更新 `workspace_state`，从而把会话树指针回滚到对应节点。恢复后的快照 ID 会回写到响应中，确保 UI 与后端保持同步。【F:src/okcvm/session.py†L180-L207】【F:src/okcvm/workspace.py†L156-L167】

## 会话与工作空间的互指

- 每个会话节点都持有工作空间 ID，`VirtualMachine.describe()` 会把 `workspace_id`、`workspace_mount`、`workspace_output` 返回给 `/api/session/info`，供前端展示“当前指向的虚拟空间”。这保证了用户在树上切换节点时，始终能定位到对应的文件目录。【F:src/okcvm/vm.py†L158-L207】【F:src/okcvm/api/main.py†L148-L171】
- 工具层通过注入的 `WorkspaceManager` 来解析路径，部署工具会把 `session_id` 写入 `deployment.json`，并把部署索引存放在工作空间根目录下。前端可以通过会话树节点读取这些元数据，判断某次部署来源于哪条对话分支。【F:src/okcvm/tools/deployment.py†L40-L170】

## 回退与清理

1. **单节点回退** – 调用 `/api/session/workspace/restore` 恢复到指定快照后，最新的 `workspace_state` 会记录 `latest_snapshot`，让前端将树指针指向目标节点，同时保持对话历史不变，方便用户继续在旧上下文上分支。【F:src/okcvm/api/main.py†L187-L222】
2. **全量重置** – `/api/session/history` 的 DELETE 操作会清除 VM 历史并调用 `WorkspaceManager.cleanup()` 删除物理目录，相当于把会话树重置到根节点，只保留新的初始化分支。【F:src/okcvm/session.py†L152-L207】【F:src/okcvm/api/main.py†L172-L186】

## 部署与 PPT 协作

- **网站部署**：`DeployWebsiteTool` 会把生成的静态站点复制到会话工作空间的 `deployments/` 子目录，生成 `deployment.json` 记录部署 ID、预览地址和 `session_id`，并维护全局索引 `manifest.json`。会话树节点可引用这些文件来呈现部署状态或启动预览服务。【F:src/okcvm/tools/deployment.py†L70-L208】
- **PPT 生成**：`SlidesGeneratorTool` 接受 HTML 片段，将带 `.ppt-slide` 类名的结构渲染为 PPTX，并写入工作空间（默认在 `generated_slides/` 目录）。该工具返回的文件路径会被 `SessionState.respond()` 收录在 `ppt_slides` 字段，使会话树的可视化层能直接展示最新 PPT 工件。【F:src/okcvm/tools/slides.py†L12-L78】【F:src/okcvm/session.py†L94-L150】

## 管理最佳实践

- 在会话树中创建新分支前，建议显式调用“创建快照”接口或依赖自动快照机制，确保后续可以精确回退。
- 若需要对比不同分支生成的部署或 PPT，可通过 `workspace_id` 和快照哈希快速定位相应目录，再结合 `deployment.json` / PPTX 文件进行比对。
- 批量清理旧节点时，先回收部署服务（停止 HTTP 服务器）并确认 PPT 文件是否需要归档，然后再执行历史删除，避免丢失重要工件。

通过会话树，OKCVM 能够把对话、文件、部署与演示稿统一在同一套索引体系下，使复杂项目的协作与回溯更加可控。
