# 部署与静态资源接口

当工具在工作区内生成站点并通过 `DeployWebsiteTool` 部署后，后端会将产物保存到持久化目录并提供以下访问方式。

## 通用说明
- 所有部署 ID 均为六位数字字符串，例如 `123456`。
- 资源路径会根据当前会话可访问的工作区进行解析，若不存在对应产物将返回 `404`。
- URL 中允许传入 `client_id` 查询参数，若省略则后端会尝试通过请求上下文推断。

## GET `/`
根路径根据参数表现不同：
- 无参数时 302 重定向到前端 UI：`/ui/`。
- 携带查询参数 `s=<deployment_id>` 时，直接返回该部署下的资源：
  - 可选 `path=<relative/path>` 指定相对文件路径（默认 `index.html`）。
  - 可选 `client_id` 指定会话归属。

## GET `/{deployment_id}` 与 `/{deployment_id}/`
返回部署的首页（等价于 `index.html`）。

## GET `/{deployment_id}/{asset_path}`
返回部署目录中的任意静态文件。

- 后端会阻止访问越权路径（禁止 `..`、绝对路径等）。
- 对于 `.html`/`.htm` 文件，会在响应头中设置 `Content-Type: text/html`。

## 前端使用建议
1. 优先使用 `web_preview.url` 字段提供的完整 URL，它已经包含 `client_id` 查询参数，可直接在浏览器新窗口或 `<iframe>` 中加载。
2. 若需要自定义资源访问路径，建议保留 `client_id` 并确保按上述规则构建 URL，以避免命中其它会话的部署。
3. 当调用 `DELETE /api/session/history` 清理历史时，服务器会尝试删除同会话的部署目录并返回摘要，请在前端同步刷新页面列表。
