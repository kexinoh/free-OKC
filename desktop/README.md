# OKCVM Desktop

OKCVM 的跨平台桌面应用，基于 [Electron](https://www.electronjs.org/) 构建。

## 特性

- 🚀 **开箱即用** - 内置 Python 后端，无需额外配置
- 🌐 **跨平台** - 支持 macOS、Windows、Linux
- 🖥️ **原生体验** - 系统托盘、全局快捷键、原生通知
- 🔄 **自动更新** - 内置更新器，保持最新版本
- 🌙 **深色模式** - 跟随系统主题自动切换
- 📁 **文件集成** - 原生文件对话框，拖放支持

## 系统要求

| 平台 | 最低版本 |
|------|----------|
| macOS | 10.15 (Catalina) |
| Windows | 10 |
| Linux | Ubuntu 20.04+ |

## 开发环境设置

### 前置条件

1. **Node.js 18+**
   ```bash
   # 使用 nvm 安装
   nvm install 18
   nvm use 18
   ```

2. **Python 3.9+** (用于后端)
   ```bash
   python --version  # 确保 >= 3.9
   ```

3. **PyInstaller** (用于打包后端)
   ```bash
   pip install pyinstaller
   ```

### 安装依赖

```bash
cd desktop
npm install
```

### 开发模式

```bash
# Linux/macOS
./scripts/dev.sh

# Windows
powershell -ExecutionPolicy Bypass -File scripts/dev.ps1

# 或直接使用 npm
npm run dev
```

开发模式会：
1. 启动 Python 后端（开发模式）
2. 启动 Electron 应用并连接到后端
3. 打开开发者工具

### 生产构建

```bash
# 构建所有平台
npm run build

# 仅构建 macOS
npm run build:mac

# 仅构建 Windows
npm run build:win

# 仅构建 Linux
npm run build:linux
```

构建产物位于 `dist/` 目录。

## 项目结构

```
desktop/
├── main/                   # Electron 主进程
│   ├── main.js            # 应用入口
│   ├── preload.js         # 预加载脚本
│   ├── backend.js         # 后端进程管理
│   └── menu.js            # 应用菜单
├── src/                    # 前端适配层
│   ├── adapter/           # 原生 API 桥接
│   │   ├── index.js       # 适配器入口
│   │   ├── native-bridge.js
│   │   ├── file-system.js
│   │   ├── theme.js
│   │   ├── shortcuts.js
│   │   ├── notifications.js
│   │   └── updater.js
│   ├── patches/           # 前端补丁
│   └── preload.js         # 前端预加载脚本
├── resources/             # 应用资源
│   ├── icon.icns          # macOS 图标
│   ├── icon.ico           # Windows 图标
│   └── icon.png           # Linux 图标
├── scripts/               # 构建脚本
│   ├── build.sh
│   ├── dev.sh
│   └── bundle-backend.py
├── backend-bundle/        # Python 打包配置
└── tests/                 # 测试文件
```

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Cmd/Ctrl+Shift+K` | 显示/隐藏窗口 |
| `Cmd/Ctrl+Shift+N` | 新建对话 |
| `Cmd/Ctrl+N` | 新建对话（窗口内） |
| `Cmd/Ctrl+,` | 打开设置 |
| `Cmd/Ctrl+Enter` | 发送消息 |
| `Cmd/Ctrl+K` | 聚焦搜索 |
| `Cmd/Ctrl+Q` | 退出应用 |

## 架构说明

### 主进程 (Main Process)

- `main/main.js`: 应用入口，创建窗口、托盘、菜单
- `main/backend.js`: 管理 Python 后端进程的生命周期
- `main/preload.js`: 通过 contextBridge 暴露安全的 API

### 渲染进程 (Renderer Process)

- 加载 Web 前端 (`frontend/`)
- 通过 `window.electronAPI` 访问原生功能
- 适配器层 (`src/adapter/`) 提供统一的 API

### 后端进程 (Backend Process)

- Python FastAPI 服务
- 作为子进程运行
- 通过 HTTP API 与前端通信

## 打包说明

### 后端打包

使用 PyInstaller 将 Python 后端打包为单个可执行文件：

```bash
python scripts/bundle-backend.py
```

打包产物位于 `backend-bundle/dist/`。

### Electron 打包

使用 electron-builder 打包应用：

```bash
npm run build
```

支持的输出格式：
- **macOS**: DMG, ZIP
- **Windows**: NSIS 安装程序, 便携版
- **Linux**: AppImage, DEB

## 配置

应用配置存储在用户数据目录：
- **macOS**: `~/Library/Application Support/OKCVM/`
- **Windows**: `%APPDATA%\OKCVM\`
- **Linux**: `~/.config/OKCVM/`

## 相关文档

- [桌面端设计规范](../spec/desktop.md)
- [架构文档](../docs/architecture.md)
- [安全说明](../security.md)

## 故障排除

### 后端启动失败

1. 检查端口 8000-9000 是否被占用
2. 查看日志目录中的错误信息
3. 确保 Python 依赖已正确安装

### 窗口无法显示

1. 检查是否在系统托盘中
2. 使用快捷键 `Cmd/Ctrl+Shift+K` 唤起窗口
3. 重启应用

### 更新失败

1. 检查网络连接
2. 手动下载最新版本
3. 查看 GitHub Releases 页面

## 许可证

[MIT License](../LICENSE)
