# OKCVM Desktop Application Specification

本文档详细描述 OKCVM 桌面端应用的设计规范，包括架构设计、技术选型、模块划分、接口定义和实现细节。此规范用于保证不同开发会话之间的一致性。

---

## 目录

1. [概述](#1-概述)
2. [技术选型](#2-技术选型)
3. [整体架构](#3-整体架构)
4. [目录结构](#4-目录结构)
5. [核心模块设计](#5-核心模块设计)
6. [前端适配层](#6-前端适配层)
7. [后端集成](#7-后端集成)
8. [数据存储](#8-数据存储)
9. [安全设计](#9-安全设计)
10. [构建与分发](#10-构建与分发)
11. [桌面专属功能](#11-桌面专属功能)
12. [开发规范](#12-开发规范)
13. [测试策略](#13-测试策略)

---

## 1. 概述

### 1.1 项目背景

OKCVM (OK Computer Virtual Machine) 是一个自托管的 AI Agent 工作流平台。当前版本采用 FastAPI + 静态前端的 Web 架构，通过浏览器访问。桌面端应用旨在提供更好的本地体验，包括：

- 原生应用体验（系统托盘、快捷键、通知）
- 离线能力（本地数据存储）
- 更好的文件系统集成
- 自动更新机制
- 跨平台支持（macOS、Windows、Linux）

### 1.2 设计原则

1. **最小侵入原则**：桌面端代码独立存放，不修改现有 `src/`、`frontend/` 目录
2. **复用优先**：最大化复用现有 Web 前端代码
3. **渐进增强**：Web 和桌面功能可以独立演进
4. **安全第一**：遵循最小权限原则，细粒度控制系统访问
5. **用户体验**：提供原生级别的交互体验

### 1.3 目标平台

| 平台 | 最低版本 | 架构 |
|------|----------|------|
| macOS | 10.15 (Catalina) | x64, arm64 |
| Windows | 10 (1803) | x64 |
| Linux | Ubuntu 20.04+ | x64 |

---

## 2. 技术选型

### 2.1 选型决策：Tauri

经过对 Electron、Tauri、PyWebView、Flutter 等方案的评估，选择 **Tauri** 作为桌面端框架：

| 评估维度 | Electron | Tauri | PyWebView | Flutter |
|----------|----------|-------|-----------|---------|
| 产物体积 | ~150MB | ~10MB | ~50MB | ~20MB |
| 内存占用 | 高 | 低 | 中 | 低 |
| 前端复用 | ✅ 完全 | ✅ 完全 | ✅ 完全 | ❌ 需重写 |
| Python 集成 | 中等 | ✅ Sidecar | ✅ 原生 | ❌ 困难 |
| 安全性 | 一般 | ✅ 优秀 | 一般 | 良好 |
| 学习曲线 | 低 | 中（需 Rust） | 低 | 高 |
| 生态成熟度 | ✅ 成熟 | 良好 | 有限 | ✅ 成熟 |

**选择理由**：
1. 体积小，安装包约 10-20MB
2. 内存占用低，使用系统 WebView
3. 完全复用现有 `frontend/` 代码
4. Sidecar 功能可打包 Python 后端
5. 细粒度权限控制，安全性高
6. 内置自动更新机制

### 2.2 技术栈

```
┌─────────────────────────────────────────────┐
│                 Tech Stack                   │
├─────────────────────────────────────────────┤
│  Desktop Shell    │  Tauri 1.x (Rust)       │
│  WebView Engine   │  WKWebView / WebView2   │
│  Frontend         │  Vanilla JS (existing)  │
│  Backend          │  Python FastAPI         │
│  Packaging        │  PyInstaller            │
│  Database         │  SQLite (local)         │
│  Build Tool       │  Cargo + npm            │
└─────────────────────────────────────────────┘
```

### 2.3 版本要求

```toml
# Rust 工具链
rust = ">=1.70"
tauri = "1.5"
tauri-build = "1.5"

# Node.js 工具链
node = ">=18.0"
npm = ">=9.0"

# Python 工具链
python = ">=3.9"
pyinstaller = ">=6.0"
```

---

## 3. 整体架构

### 3.1 架构图

```
┌──────────────────────────────────────────────────────────────────────┐
│                        OKCVM Desktop Application                      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                    Tauri Core (Rust)                            │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │  │
│  │  │   Window     │  │    IPC       │  │   System             │  │  │
│  │  │   Manager    │  │   Bridge     │  │   Integration        │  │  │
│  │  │              │  │              │  │   - Tray             │  │  │
│  │  │  - Create    │  │  - invoke()  │  │   - Shortcuts        │  │  │
│  │  │  - Position  │  │  - emit()    │  │   - Notifications    │  │  │
│  │  │  - Fullscreen│  │  - listen()  │  │   - File dialogs     │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘  │  │
│  │                                                                  │  │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │  │
│  │  │   Sidecar    │  │   Updater    │  │   State              │  │  │
│  │  │   Manager    │  │   Module     │  │   Manager            │  │  │
│  │  │              │  │              │  │                      │  │  │
│  │  │  - Spawn     │  │  - Check     │  │  - App config        │  │  │
│  │  │  - Monitor   │  │  - Download  │  │  - Window state      │  │  │
│  │  │  - Restart   │  │  - Install   │  │  - User prefs        │  │  │
│  │  └──────────────┘  └──────────────┘  └──────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                              │                                         │
│                              │ WebView                                 │
│                              ▼                                         │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                    Frontend Layer                               │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │              Desktop Adapter (New)                        │  │  │
│  │  │  - native-bridge.js   (Tauri API wrapper)                │  │  │
│  │  │  - file-system.js     (Native file operations)           │  │  │
│  │  │  - notifications.js   (System notifications)             │  │  │
│  │  │  - shortcuts.js       (Global shortcuts)                 │  │  │
│  │  │  - theme.js           (System theme sync)                │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  │                              │                                   │  │
│  │  ┌──────────────────────────┴───────────────────────────────┐  │  │
│  │  │              Existing Frontend (Reused)                   │  │  │
│  │  │  - index.html           - conversationState.js           │  │  │
│  │  │  - styles.css           - streamingController.js         │  │  │
│  │  │  - app/index.js         - utils.js                       │  │  │
│  │  │  - config.js            - previews.js                    │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                              │                                         │
│                              │ HTTP (localhost)                        │
│                              ▼                                         │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                    Python Backend (Sidecar)                     │  │
│  │  ┌──────────────────────────────────────────────────────────┐  │  │
│  │  │              okcvm-server (PyInstaller Bundle)            │  │  │
│  │  │  - FastAPI server on localhost:${DYNAMIC_PORT}           │  │  │
│  │  │  - SQLite for local persistence                          │  │  │
│  │  │  - Workspace management                                   │  │  │
│  │  │  - LLM orchestration                                      │  │  │
│  │  └──────────────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                        │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.2 通信流程

```
┌─────────┐     IPC invoke     ┌─────────┐     HTTP      ┌─────────┐
│         │ ─────────────────► │         │ ────────────► │         │
│ Frontend│                    │  Tauri  │               │ Python  │
│ WebView │ ◄───────────────── │  Core   │ ◄──────────── │ Backend │
│         │     IPC event      │         │   Response    │         │
└─────────┘                    └─────────┘               └─────────┘
     │                              │                         │
     │  1. User action              │                         │
     │ ───────────────────────────► │                         │
     │                              │  2. Spawn sidecar       │
     │                              │ ──────────────────────► │
     │                              │                         │
     │                              │  3. Health check        │
     │                              │ ──────────────────────► │
     │                              │  4. Ready signal        │
     │                              │ ◄────────────────────── │
     │  5. Backend URL              │                         │
     │ ◄─────────────────────────── │                         │
     │                              │                         │
     │  6. API requests (direct)    │                         │
     │ ─────────────────────────────┼───────────────────────► │
     │  7. Responses                │                         │
     │ ◄────────────────────────────┼─────────────────────── │
     │                              │                         │
```

### 3.3 生命周期

```
App Launch
    │
    ▼
┌─────────────────┐
│ Initialize Tauri│
│ - Load config   │
│ - Setup logging │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Spawn Sidecar   │
│ - Start Python  │
│ - Find free port│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Wait for Ready  │◄──── Retry (max 30s)
│ - Health check  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Create Window   │
│ - Load frontend │
│ - Inject config │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Setup System    │
│ - Tray icon     │
│ - Shortcuts     │
└────────┬────────┘
         │
         ▼
    App Running
         │
    ┌────┴────┐
    │         │
    ▼         ▼
 Close    Minimize
 Window   to Tray
    │         │
    ▼         │
┌─────────┐   │
│ Cleanup │   │
│ - Stop  │   │
│   sidecar   │
└────┬────┘   │
     │        │
     ▼        │
   Exit  ◄────┘
```

---

## 4. 目录结构

### 4.1 桌面端目录（`desktop/`）

```
desktop/
├── README.md                      # 桌面端项目说明
├── package.json                   # npm 配置（前端构建）
├── package-lock.json
│
├── src-tauri/                     # Tauri Rust 源码
│   ├── Cargo.toml                 # Rust 依赖配置
│   ├── Cargo.lock
│   ├── build.rs                   # 构建脚本
│   ├── tauri.conf.json            # Tauri 主配置
│   │
│   ├── src/
│   │   ├── main.rs                # 应用入口
│   │   ├── lib.rs                 # 库入口（供测试）
│   │   ├── commands/              # IPC 命令处理
│   │   │   ├── mod.rs
│   │   │   ├── backend.rs         # 后端管理命令
│   │   │   ├── files.rs           # 文件操作命令
│   │   │   └── config.rs          # 配置管理命令
│   │   ├── sidecar/               # Sidecar 管理
│   │   │   ├── mod.rs
│   │   │   ├── manager.rs         # 进程生命周期
│   │   │   └── health.rs          # 健康检查
│   │   ├── system/                # 系统集成
│   │   │   ├── mod.rs
│   │   │   ├── tray.rs            # 系统托盘
│   │   │   ├── shortcuts.rs       # 全局快捷键
│   │   │   └── theme.rs           # 主题检测
│   │   ├── state/                 # 状态管理
│   │   │   ├── mod.rs
│   │   │   └── app_state.rs       # 应用状态
│   │   └── utils/                 # 工具函数
│   │       ├── mod.rs
│   │       ├── port.rs            # 端口发现
│   │       └── paths.rs           # 路径处理
│   │
│   ├── icons/                     # 应用图标
│   │   ├── icon.icns              # macOS
│   │   ├── icon.ico               # Windows
│   │   ├── icon.png               # Linux / 通用
│   │   ├── 32x32.png
│   │   ├── 128x128.png
│   │   ├── 128x128@2x.png
│   │   └── Square*.png            # Windows Store
│   │
│   └── binaries/                  # Sidecar 二进制文件（构建时生成）
│       └── .gitkeep
│
├── src/                           # 前端适配层（新增）
│   ├── adapter/
│   │   ├── index.js               # 适配层入口
│   │   ├── native-bridge.js       # Tauri API 封装
│   │   ├── file-system.js         # 原生文件操作
│   │   ├── notifications.js       # 系统通知
│   │   ├── shortcuts.js           # 快捷键绑定
│   │   ├── theme.js               # 主题同步
│   │   └── updater.js             # 自动更新
│   │
│   ├── patches/                   # 前端补丁
│   │   ├── utils.patch.js         # utils.js 增强
│   │   └── config.patch.js        # config.js 增强
│   │
│   └── preload.js                 # 预加载脚本
│
├── scripts/                       # 构建脚本
│   ├── dev.sh                     # 开发启动（Unix）
│   ├── dev.ps1                    # 开发启动（Windows）
│   ├── build.sh                   # 生产构建（Unix）
│   ├── build.ps1                  # 生产构建（Windows）
│   ├── bundle-backend.py          # Python 后端打包
│   └── generate-icons.sh          # 图标生成
│
├── backend-bundle/                # Python 后端打包配置
│   ├── okcvm-server.spec          # PyInstaller spec
│   ├── hook-okcvm.py              # PyInstaller hook
│   └── runtime-hooks/
│       └── pyi_rth_okcvm.py       # 运行时 hook
│
└── tests/                         # 桌面端测试
    ├── e2e/                       # 端到端测试
    │   ├── launch.spec.ts
    │   └── sidecar.spec.ts
    └── unit/                      # 单元测试
        └── adapter.test.js
```

### 4.2 文件职责说明

| 文件/目录 | 职责 |
|-----------|------|
| `src-tauri/src/main.rs` | 应用入口，初始化 Tauri 运行时 |
| `src-tauri/src/commands/` | 处理前端 IPC 调用 |
| `src-tauri/src/sidecar/` | Python 后端进程管理 |
| `src-tauri/src/system/` | 系统级功能（托盘、快捷键等） |
| `src/adapter/` | 前端与原生 API 的桥接层 |
| `src/patches/` | 对现有前端的最小化增强 |
| `backend-bundle/` | Python 打包为可执行文件的配置 |
| `scripts/` | 开发和构建自动化脚本 |

---

## 5. 核心模块设计

### 5.1 Sidecar 管理器

#### 5.1.1 接口定义

```rust
// desktop/src-tauri/src/sidecar/manager.rs

/// Sidecar 管理器配置
pub struct SidecarConfig {
    /// 健康检查间隔（毫秒）
    pub health_check_interval: u64,
    /// 启动超时（毫秒）
    pub startup_timeout: u64,
    /// 最大重启次数
    pub max_restart_attempts: u32,
    /// 重启延迟（毫秒）
    pub restart_delay: u64,
}

/// Sidecar 状态
#[derive(Clone, Debug, PartialEq)]
pub enum SidecarStatus {
    Starting,
    Running { port: u16, pid: u32 },
    Stopping,
    Stopped,
    Failed { error: String },
}

/// Sidecar 管理器
pub struct SidecarManager {
    config: SidecarConfig,
    status: Arc<RwLock<SidecarStatus>>,
    child: Option<CommandChild>,
}

impl SidecarManager {
    /// 启动 sidecar
    pub async fn start(&mut self) -> Result<u16, SidecarError>;
    
    /// 停止 sidecar
    pub async fn stop(&mut self) -> Result<(), SidecarError>;
    
    /// 重启 sidecar
    pub async fn restart(&mut self) -> Result<u16, SidecarError>;
    
    /// 获取当前状态
    pub fn status(&self) -> SidecarStatus;
    
    /// 健康检查
    pub async fn health_check(&self) -> Result<bool, SidecarError>;
}
```

#### 5.1.2 启动流程

```rust
// 启动 sidecar 的伪代码流程
async fn start(&mut self) -> Result<u16, SidecarError> {
    // 1. 查找可用端口
    let port = find_available_port(8000..9000)?;
    
    // 2. 构建启动参数
    let args = vec![
        "--host", "127.0.0.1",
        "--port", &port.to_string(),
        "--data-dir", &self.data_dir.to_string(),
    ];
    
    // 3. 启动进程
    let (rx, child) = Command::new_sidecar("okcvm-server")?
        .args(&args)
        .spawn()?;
    
    self.child = Some(child);
    
    // 4. 等待就绪
    let ready = timeout(
        Duration::from_millis(self.config.startup_timeout),
        self.wait_for_ready(port)
    ).await?;
    
    if ready {
        self.status = SidecarStatus::Running { port, pid: child.pid() };
        Ok(port)
    } else {
        Err(SidecarError::StartupTimeout)
    }
}
```

### 5.2 IPC 命令

#### 5.2.1 命令清单

| 命令名 | 参数 | 返回值 | 说明 |
|--------|------|--------|------|
| `get_backend_url` | - | `String` | 获取后端 URL |
| `restart_backend` | - | `bool` | 重启后端服务 |
| `get_backend_status` | - | `SidecarStatus` | 获取后端状态 |
| `open_file_dialog` | `FileDialogOptions` | `Vec<String>` | 打开文件选择器 |
| `save_file_dialog` | `SaveDialogOptions` | `Option<String>` | 打开保存对话框 |
| `read_local_file` | `path: String` | `Vec<u8>` | 读取本地文件 |
| `write_local_file` | `path: String, data: Vec<u8>` | `bool` | 写入本地文件 |
| `show_notification` | `NotificationOptions` | `()` | 显示系统通知 |
| `get_system_theme` | - | `"light" \| "dark"` | 获取系统主题 |
| `set_window_title` | `title: String` | `()` | 设置窗口标题 |
| `minimize_to_tray` | - | `()` | 最小化到托盘 |

#### 5.2.2 实现示例

```rust
// desktop/src-tauri/src/commands/backend.rs

use tauri::State;
use crate::sidecar::SidecarManager;

#[tauri::command]
pub async fn get_backend_url(
    manager: State<'_, SidecarManager>
) -> Result<String, String> {
    match manager.status() {
        SidecarStatus::Running { port, .. } => {
            Ok(format!("http://127.0.0.1:{}", port))
        }
        _ => Err("Backend not running".to_string())
    }
}

#[tauri::command]
pub async fn restart_backend(
    manager: State<'_, SidecarManager>
) -> Result<bool, String> {
    manager.restart().await
        .map(|_| true)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_backend_status(
    manager: State<'_, SidecarManager>
) -> SidecarStatus {
    manager.status()
}
```

### 5.3 系统托盘

#### 5.3.1 菜单结构

```
┌─────────────────────┐
│  OKCVM              │ ← 点击打开主窗口
├─────────────────────┤
│  ✓ 后端运行中       │ ← 状态指示（只读）
├─────────────────────┤
│  打开主窗口         │
│  新建对话           │
├─────────────────────┤
│  重启后端服务       │
│  查看日志...        │
├─────────────────────┤
│  偏好设置...        │
│  检查更新...        │
├─────────────────────┤
│  退出               │
└─────────────────────┘
```

#### 5.3.2 实现

```rust
// desktop/src-tauri/src/system/tray.rs

use tauri::{
    AppHandle, CustomMenuItem, Manager, SystemTray, 
    SystemTrayEvent, SystemTrayMenu, SystemTrayMenuItem
};

pub fn create_tray() -> SystemTray {
    let menu = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("status", "✓ 后端运行中").disabled())
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("open", "打开主窗口"))
        .add_item(CustomMenuItem::new("new_chat", "新建对话"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("restart", "重启后端服务"))
        .add_item(CustomMenuItem::new("logs", "查看日志..."))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("preferences", "偏好设置..."))
        .add_item(CustomMenuItem::new("update", "检查更新..."))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("quit", "退出"));

    SystemTray::new().with_menu(menu)
}

pub fn handle_tray_event(app: &AppHandle, event: SystemTrayEvent) {
    match event {
        SystemTrayEvent::LeftClick { .. } => {
            show_main_window(app);
        }
        SystemTrayEvent::MenuItemClick { id, .. } => {
            match id.as_str() {
                "open" => show_main_window(app),
                "new_chat" => create_new_chat(app),
                "restart" => restart_backend(app),
                "quit" => app.exit(0),
                _ => {}
            }
        }
        _ => {}
    }
}
```

### 5.4 全局快捷键

#### 5.4.1 默认快捷键

| 快捷键 | 功能 | 可自定义 |
|--------|------|----------|
| `Cmd/Ctrl+Shift+K` | 显示/隐藏主窗口 | ✅ |
| `Cmd/Ctrl+Shift+N` | 新建对话 | ✅ |
| `Cmd/Ctrl+,` | 打开设置 | ❌ |
| `Cmd/Ctrl+Q` | 退出应用 | ❌ |

#### 5.4.2 实现

```rust
// desktop/src-tauri/src/system/shortcuts.rs

use tauri::{AppHandle, GlobalShortcutManager};

pub fn register_shortcuts(app: &AppHandle) -> Result<(), Box<dyn Error>> {
    let mut manager = app.global_shortcut_manager();
    
    // 显示/隐藏窗口
    let app_handle = app.clone();
    manager.register("CmdOrCtrl+Shift+K", move || {
        toggle_window_visibility(&app_handle);
    })?;
    
    // 新建对话
    let app_handle = app.clone();
    manager.register("CmdOrCtrl+Shift+N", move || {
        create_new_chat(&app_handle);
    })?;
    
    Ok(())
}
```

---

## 6. 前端适配层

### 6.1 设计目标

前端适配层的目标是在 **不修改** 现有 `frontend/` 代码的前提下，提供桌面端专属功能。通过以下策略实现：

1. **运行时检测**：检测是否在 Tauri 环境中运行
2. **API 代理**：代理网络请求，注入桌面端配置
3. **功能增强**：在桌面模式下提供原生功能

### 6.2 原生桥接 API

```javascript
// desktop/src/adapter/native-bridge.js

/**
 * Tauri 原生 API 桥接层
 * 提供统一的接口，自动检测运行环境
 */

const isTauri = () => !!window.__TAURI__;

// 懒加载 Tauri 模块
let tauriInvoke = null;
let tauriDialog = null;
let tauriNotification = null;
let tauriEvent = null;

async function loadTauriModules() {
    if (!isTauri()) return;
    
    const { invoke } = await import('@tauri-apps/api/tauri');
    const { open, save } = await import('@tauri-apps/api/dialog');
    const { sendNotification, isPermissionGranted, requestPermission } 
        = await import('@tauri-apps/api/notification');
    const { listen, emit } = await import('@tauri-apps/api/event');
    
    tauriInvoke = invoke;
    tauriDialog = { open, save };
    tauriNotification = { sendNotification, isPermissionGranted, requestPermission };
    tauriEvent = { listen, emit };
}

// 初始化时加载
loadTauriModules();

/**
 * 统一的原生 API
 */
export const NativeBridge = {
    /**
     * 检测是否为桌面模式
     */
    isDesktop: isTauri,
    
    /**
     * 调用 Rust 命令
     */
    async invoke(cmd, args = {}) {
        if (!isTauri()) {
            throw new Error('Not in Tauri environment');
        }
        return await tauriInvoke(cmd, args);
    },
    
    /**
     * 获取后端 URL
     */
    async getBackendUrl() {
        if (isTauri()) {
            return await tauriInvoke('get_backend_url');
        }
        // Web 模式使用相对路径
        return '';
    },
    
    /**
     * 监听原生事件
     */
    async listen(event, callback) {
        if (!isTauri()) return () => {};
        return await tauriEvent.listen(event, callback);
    },
    
    /**
     * 发送事件到 Rust
     */
    async emit(event, payload) {
        if (!isTauri()) return;
        await tauriEvent.emit(event, payload);
    }
};

export default NativeBridge;
```

### 6.3 文件系统适配

```javascript
// desktop/src/adapter/file-system.js

import NativeBridge from './native-bridge.js';

/**
 * 文件系统操作适配器
 */
export const FileSystem = {
    /**
     * 选择文件（桌面模式使用原生对话框）
     */
    async selectFiles(options = {}) {
        if (NativeBridge.isDesktop()) {
            const { open } = await import('@tauri-apps/api/dialog');
            const selected = await open({
                multiple: options.multiple ?? true,
                filters: options.filters ?? [
                    { name: 'All Files', extensions: ['*'] }
                ],
                directory: options.directory ?? false
            });
            
            // 转换为统一格式
            if (!selected) return [];
            const paths = Array.isArray(selected) ? selected : [selected];
            
            // 读取文件内容
            return await Promise.all(paths.map(async (path) => {
                const content = await NativeBridge.invoke('read_local_file', { path });
                const name = path.split(/[/\\]/).pop();
                return {
                    name,
                    path,
                    content: new Uint8Array(content),
                    size: content.length
                };
            }));
        }
        
        // Web 模式回退到 input[type=file]
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.multiple = options.multiple ?? true;
            input.accept = options.accept ?? '*';
            
            input.onchange = async () => {
                const files = Array.from(input.files);
                const results = await Promise.all(files.map(async (file) => {
                    const content = await file.arrayBuffer();
                    return {
                        name: file.name,
                        path: file.name,
                        content: new Uint8Array(content),
                        size: file.size
                    };
                }));
                resolve(results);
            };
            
            input.click();
        });
    },
    
    /**
     * 保存文件
     */
    async saveFile(content, defaultName, filters) {
        if (NativeBridge.isDesktop()) {
            const { save } = await import('@tauri-apps/api/dialog');
            const path = await save({
                defaultPath: defaultName,
                filters: filters ?? [{ name: 'All Files', extensions: ['*'] }]
            });
            
            if (path) {
                await NativeBridge.invoke('write_local_file', {
                    path,
                    data: Array.from(content)
                });
                return path;
            }
            return null;
        }
        
        // Web 模式使用下载
        const blob = new Blob([content]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = defaultName;
        a.click();
        URL.revokeObjectURL(url);
        return defaultName;
    },
    
    /**
     * 拖放文件处理
     */
    setupDragDrop(element, onDrop) {
        if (NativeBridge.isDesktop()) {
            // Tauri 拖放事件
            NativeBridge.listen('tauri://file-drop', async (event) => {
                const paths = event.payload;
                const files = await Promise.all(paths.map(async (path) => {
                    const content = await NativeBridge.invoke('read_local_file', { path });
                    return {
                        name: path.split(/[/\\]/).pop(),
                        path,
                        content: new Uint8Array(content)
                    };
                }));
                onDrop(files);
            });
        }
        
        // 同时保留 Web 拖放支持
        element.addEventListener('drop', async (e) => {
            e.preventDefault();
            const files = Array.from(e.dataTransfer.files);
            const results = await Promise.all(files.map(async (file) => ({
                name: file.name,
                path: file.name,
                content: new Uint8Array(await file.arrayBuffer())
            })));
            onDrop(results);
        });
        
        element.addEventListener('dragover', (e) => e.preventDefault());
    }
};

export default FileSystem;
```

### 6.4 系统通知适配

```javascript
// desktop/src/adapter/notifications.js

import NativeBridge from './native-bridge.js';

/**
 * 系统通知适配器
 */
export const Notifications = {
    /**
     * 检查通知权限
     */
    async checkPermission() {
        if (NativeBridge.isDesktop()) {
            const { isPermissionGranted } = await import('@tauri-apps/api/notification');
            return await isPermissionGranted();
        }
        return Notification.permission === 'granted';
    },
    
    /**
     * 请求通知权限
     */
    async requestPermission() {
        if (NativeBridge.isDesktop()) {
            const { requestPermission } = await import('@tauri-apps/api/notification');
            return await requestPermission();
        }
        return await Notification.requestPermission();
    },
    
    /**
     * 发送通知
     */
    async send(title, body, options = {}) {
        if (NativeBridge.isDesktop()) {
            const { sendNotification } = await import('@tauri-apps/api/notification');
            await sendNotification({
                title,
                body,
                icon: options.icon
            });
            return;
        }
        
        // Web 通知
        if (Notification.permission === 'granted') {
            new Notification(title, { body, icon: options.icon });
        }
    },
    
    /**
     * 任务完成通知
     */
    async notifyTaskComplete(taskName) {
        await this.send(
            'OKCVM',
            `任务已完成: ${taskName}`,
            { icon: '/icons/success.png' }
        );
    },
    
    /**
     * 错误通知
     */
    async notifyError(message) {
        await this.send(
            'OKCVM 错误',
            message,
            { icon: '/icons/error.png' }
        );
    }
};

export default Notifications;
```

### 6.5 主题同步

```javascript
// desktop/src/adapter/theme.js

import NativeBridge from './native-bridge.js';

/**
 * 系统主题同步
 */
export const Theme = {
    _listeners: new Set(),
    _currentTheme: 'light',
    
    /**
     * 初始化主题监听
     */
    async init() {
        // 获取初始主题
        this._currentTheme = await this.getSystemTheme();
        this.applyTheme(this._currentTheme);
        
        if (NativeBridge.isDesktop()) {
            // 监听 Tauri 主题变化事件
            NativeBridge.listen('theme-changed', (event) => {
                this._currentTheme = event.payload;
                this.applyTheme(this._currentTheme);
                this._notifyListeners();
            });
        } else {
            // Web 模式监听 prefers-color-scheme
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            mediaQuery.addEventListener('change', (e) => {
                this._currentTheme = e.matches ? 'dark' : 'light';
                this.applyTheme(this._currentTheme);
                this._notifyListeners();
            });
        }
    },
    
    /**
     * 获取系统主题
     */
    async getSystemTheme() {
        if (NativeBridge.isDesktop()) {
            return await NativeBridge.invoke('get_system_theme');
        }
        return window.matchMedia('(prefers-color-scheme: dark)').matches 
            ? 'dark' 
            : 'light';
    },
    
    /**
     * 应用主题到 DOM
     */
    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        document.body.classList.toggle('dark-mode', theme === 'dark');
    },
    
    /**
     * 订阅主题变化
     */
    subscribe(callback) {
        this._listeners.add(callback);
        return () => this._listeners.delete(callback);
    },
    
    _notifyListeners() {
        this._listeners.forEach(cb => cb(this._currentTheme));
    }
};

export default Theme;
```

### 6.6 预加载脚本

```javascript
// desktop/src/preload.js

/**
 * 预加载脚本
 * 在前端加载前执行，设置全局配置
 */

import NativeBridge from './adapter/native-bridge.js';
import FileSystem from './adapter/file-system.js';
import Notifications from './adapter/notifications.js';
import Theme from './adapter/theme.js';

(async function preload() {
    // 等待 Tauri API 就绪
    if (NativeBridge.isDesktop()) {
        // 获取后端 URL 并注入全局配置
        const backendUrl = await NativeBridge.getBackendUrl();
        window.__OKCVM_CONFIG__ = {
            isDesktop: true,
            backendUrl,
            version: await NativeBridge.invoke('get_app_version')
        };
        
        // 初始化主题
        await Theme.init();
        
        // 请求通知权限
        await Notifications.requestPermission();
        
        console.log('[OKCVM Desktop] Initialized', window.__OKCVM_CONFIG__);
    } else {
        window.__OKCVM_CONFIG__ = {
            isDesktop: false,
            backendUrl: '',
            version: 'web'
        };
    }
    
    // 导出全局 API
    window.OKCVM = {
        NativeBridge,
        FileSystem,
        Notifications,
        Theme,
        isDesktop: NativeBridge.isDesktop
    };
})();
```

---

## 7. 后端集成

### 7.1 Python 后端打包

#### 7.1.1 PyInstaller 配置

```python
# desktop/backend-bundle/okcvm-server.spec

# -*- mode: python ; coding: utf-8 -*-

import sys
from pathlib import Path

# 项目根目录
PROJECT_ROOT = Path(__file__).parent.parent.parent
SRC_DIR = PROJECT_ROOT / 'src'

block_cipher = None

# 收集所有需要的数据文件
datas = [
    # 规范文件
    (str(PROJECT_ROOT / 'spec'), 'spec'),
    # 前端文件
    (str(PROJECT_ROOT / 'frontend'), 'frontend'),
    # 配置模板
    (str(PROJECT_ROOT / 'config.yaml'), '.'),
]

# 隐式导入
hiddenimports = [
    'okcvm',
    'okcvm.api',
    'okcvm.api.main',
    'okcvm.tools',
    'okcvm.tools.shell',
    'okcvm.tools.files',
    'okcvm.tools.browser',
    'okcvm.tools.deployment',
    'okcvm.tools.slides',
    'okcvm.storage',
    'okcvm.storage.conversations',
    'uvicorn.logging',
    'uvicorn.protocols.http',
    'uvicorn.protocols.websockets',
    'uvicorn.lifespan',
    'sqlalchemy.dialects.sqlite',
    'langchain',
    'langchain_openai',
]

a = Analysis(
    [str(SRC_DIR / 'okcvm' / 'server.py')],
    pathex=[str(SRC_DIR)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[str(Path(__file__).parent)],
    hooksconfig={},
    runtime_hooks=[str(Path(__file__).parent / 'runtime-hooks' / 'pyi_rth_okcvm.py')],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='okcvm-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,  # 保留控制台输出用于调试
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='okcvm-server',
)
```

#### 7.1.2 运行时 Hook

```python
# desktop/backend-bundle/runtime-hooks/pyi_rth_okcvm.py

"""
PyInstaller 运行时 hook
在应用启动时设置必要的环境
"""

import os
import sys

def _setup_environment():
    """设置运行环境"""
    # 获取打包后的资源目录
    if getattr(sys, 'frozen', False):
        # PyInstaller 打包环境
        bundle_dir = sys._MEIPASS
    else:
        # 开发环境
        bundle_dir = os.path.dirname(os.path.abspath(__file__))
    
    # 设置环境变量
    os.environ['OKCVM_BUNDLE_DIR'] = bundle_dir
    os.environ['OKCVM_SPEC_DIR'] = os.path.join(bundle_dir, 'spec')
    os.environ['OKCVM_FRONTEND_DIR'] = os.path.join(bundle_dir, 'frontend')
    
    # 确保可以找到 spec 文件
    spec_dir = os.path.join(bundle_dir, 'spec')
    if os.path.exists(spec_dir):
        sys.path.insert(0, bundle_dir)

_setup_environment()
```

### 7.2 后端启动参数

Sidecar 启动时传递的参数：

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--host` | 绑定地址 | `127.0.0.1` |
| `--port` | 监听端口 | 动态分配 |
| `--data-dir` | 数据目录 | `$APP_DATA/okcvm` |
| `--log-level` | 日志级别 | `info` |
| `--db-path` | SQLite 路径 | `$DATA_DIR/okcvm.db` |

### 7.3 健康检查接口

后端需要提供健康检查端点供 Tauri 轮询：

```python
# 在 okcvm/api/main.py 中添加（如果不存在）

@app.get("/api/health")
async def health_check():
    """健康检查端点"""
    return {
        "status": "healthy",
        "version": "0.1.0",
        "timestamp": datetime.utcnow().isoformat()
    }
```

---

## 8. 数据存储

### 8.1 桌面端存储策略

| 数据类型 | 存储方式 | 位置 |
|----------|----------|------|
| 应用配置 | JSON 文件 | `$APP_CONFIG/config.json` |
| 对话历史 | SQLite | `$APP_DATA/okcvm.db` |
| 工作区文件 | 文件系统 | `$APP_DATA/workspaces/` |
| 日志文件 | 滚动日志 | `$APP_LOG/okcvm.log` |
| 缓存 | 文件系统 | `$APP_CACHE/` |

### 8.2 平台特定路径

| 平台 | `$APP_CONFIG` | `$APP_DATA` | `$APP_LOG` | `$APP_CACHE` |
|------|---------------|-------------|------------|--------------|
| macOS | `~/Library/Application Support/OKCVM` | 同左 | `~/Library/Logs/OKCVM` | `~/Library/Caches/OKCVM` |
| Windows | `%APPDATA%\OKCVM` | 同左 | `%APPDATA%\OKCVM\logs` | `%LOCALAPPDATA%\OKCVM\cache` |
| Linux | `~/.config/okcvm` | `~/.local/share/okcvm` | `~/.local/share/okcvm/logs` | `~/.cache/okcvm` |

### 8.3 配置文件格式

```json
// $APP_CONFIG/config.json
{
    "version": 1,
    "window": {
        "width": 1400,
        "height": 900,
        "x": null,
        "y": null,
        "maximized": false
    },
    "appearance": {
        "theme": "system",
        "fontSize": 14
    },
    "shortcuts": {
        "toggleWindow": "CmdOrCtrl+Shift+K",
        "newChat": "CmdOrCtrl+Shift+N"
    },
    "backend": {
        "autoStart": true,
        "port": null
    },
    "updates": {
        "autoCheck": true,
        "channel": "stable"
    }
}
```

---

## 9. 安全设计

### 9.1 Tauri 权限配置

```json
// tauri.conf.json 中的 allowlist
{
    "allowlist": {
        "all": false,
        "shell": {
            "all": false,
            "sidecar": true,
            "scope": []
        },
        "fs": {
            "all": false,
            "readFile": true,
            "writeFile": true,
            "readDir": true,
            "scope": [
                "$APP/*",
                "$DOWNLOAD/*",
                "$DOCUMENT/*"
            ]
        },
        "dialog": {
            "all": false,
            "open": true,
            "save": true
        },
        "notification": {
            "all": true
        },
        "globalShortcut": {
            "all": true
        },
        "window": {
            "all": false,
            "close": true,
            "hide": true,
            "show": true,
            "maximize": true,
            "minimize": true,
            "unmaximize": true,
            "unminimize": true,
            "setTitle": true,
            "setFocus": true
        },
        "protocol": {
            "asset": true,
            "assetScope": ["$APP/*"]
        }
    }
}
```

### 9.2 安全边界

```
┌──────────────────────────────────────────────────────────────┐
│                       Trust Boundary                          │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                    Tauri Core                           │  │
│  │  - 仅允许预定义的 IPC 命令                              │  │
│  │  - 文件访问限制在 $APP 和用户选择的路径                 │  │
│  │  - 无法执行任意 shell 命令                              │  │
│  └────────────────────────────────────────────────────────┘  │
│                              │                                 │
│                              ▼                                 │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                    Python Backend                        │  │
│  │  - 仅监听 localhost                                     │  │
│  │  - 工作区隔离（每个会话独立目录）                       │  │
│  │  - API 密钥仅存内存，不持久化                           │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### 9.3 安全检查清单

- [ ] 所有 IPC 命令验证参数
- [ ] 文件路径规范化，防止路径遍历
- [ ] API 密钥不写入日志
- [ ] 后端仅监听 127.0.0.1
- [ ] CSP 限制 WebView 资源加载
- [ ] 禁用 WebView 开发者工具（生产版本）
- [ ] 签名应用二进制文件

---

## 10. 构建与分发

### 10.1 开发环境设置

```bash
# 1. 安装 Rust 工具链
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. 安装 Node.js (推荐使用 nvm)
nvm install 18
nvm use 18

# 3. 安装 Tauri CLI
cargo install tauri-cli

# 4. 安装前端依赖
cd desktop && npm install

# 5. 安装 Python 依赖（用于后端打包）
pip install pyinstaller

# 6. 启动开发模式
npm run tauri dev
```

### 10.2 构建流程

```
┌─────────────────┐
│  Build Start    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 1. Bundle Python│
│    Backend      │──────► PyInstaller 打包
└────────┬────────┘        生成 okcvm-server 可执行文件
         │
         ▼
┌─────────────────┐
│ 2. Copy Sidecar │
│    to binaries/ │──────► 复制到 src-tauri/binaries/
└────────┬────────┘        按平台命名 (okcvm-server-x86_64-pc-windows-msvc.exe)
         │
         ▼
┌─────────────────┐
│ 3. Build Tauri  │
│    Application  │──────► cargo tauri build
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 4. Sign & Notarize│
│    (macOS/Windows)│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 5. Generate     │
│    Installers   │──────► .dmg / .msi / .AppImage / .deb
└─────────────────┘
```

### 10.3 CI/CD 配置示例

```yaml
# .github/workflows/desktop-build.yml

name: Desktop Build

on:
  push:
    tags:
      - 'desktop-v*'

jobs:
  build:
    strategy:
      matrix:
        platform:
          - os: macos-latest
            target: aarch64-apple-darwin
          - os: macos-latest
            target: x86_64-apple-darwin
          - os: windows-latest
            target: x86_64-pc-windows-msvc
          - os: ubuntu-latest
            target: x86_64-unknown-linux-gnu

    runs-on: ${{ matrix.platform.os }}

    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 18
      
      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      
      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.platform.target }}
      
      - name: Install dependencies
        run: |
          pip install pyinstaller
          cd desktop && npm install
      
      - name: Bundle Python backend
        run: |
          python desktop/scripts/bundle-backend.py --target ${{ matrix.platform.target }}
      
      - name: Build Tauri app
        uses: tauri-apps/tauri-action@v0
        with:
          projectPath: desktop
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_PRIVATE_KEY: ${{ secrets.TAURI_PRIVATE_KEY }}
          TAURI_KEY_PASSWORD: ${{ secrets.TAURI_KEY_PASSWORD }}
```

### 10.4 分发渠道

| 渠道 | 平台 | 自动更新 |
|------|------|----------|
| GitHub Releases | 全平台 | ✅ |
| Homebrew Cask | macOS | ❌ |
| Windows Store | Windows | ✅ |
| Snap Store | Linux | ✅ |
| AUR | Arch Linux | ❌ |

---

## 11. 桌面专属功能

### 11.1 功能矩阵

| 功能 | Web | Desktop | 说明 |
|------|-----|---------|------|
| 基础对话 | ✅ | ✅ | 核心功能 |
| 文件上传 | ✅ | ✅ | Desktop 支持拖放 |
| 流式响应 | ✅ | ✅ | SSE |
| 系统托盘 | ❌ | ✅ | 后台运行 |
| 全局快捷键 | ❌ | ✅ | 快速唤起 |
| 原生通知 | ⚠️ | ✅ | Web 需要权限 |
| 离线模式 | ❌ | ✅ | 本地数据 |
| 自动更新 | ❌ | ✅ | 内置更新器 |
| 深色模式同步 | ⚠️ | ✅ | 跟随系统 |
| 本地模型 | ❌ | 🔮 | 未来支持 |

### 11.2 系统托盘详细设计

#### 图标状态

| 状态 | 图标 | 说明 |
|------|------|------|
| 正常 | ![normal](icon-normal) | 后端运行中 |
| 繁忙 | ![busy](icon-busy) | 正在处理请求 |
| 错误 | ![error](icon-error) | 后端异常 |
| 更新 | ![update](icon-update) | 有可用更新 |

#### 托盘动画

- 繁忙状态：图标渐变动画
- 新消息：图标闪烁提示

### 11.3 窗口管理

#### 窗口状态持久化

```rust
// 保存窗口状态
fn save_window_state(window: &Window) {
    let state = WindowState {
        width: window.outer_size().width,
        height: window.outer_size().height,
        x: window.outer_position().x,
        y: window.outer_position().y,
        maximized: window.is_maximized(),
    };
    // 保存到配置文件
}

// 恢复窗口状态
fn restore_window_state(window: &Window, state: &WindowState) {
    window.set_size(Size::Physical(PhysicalSize::new(state.width, state.height)));
    window.set_position(Position::Physical(PhysicalPosition::new(state.x, state.y)));
    if state.maximized {
        window.maximize();
    }
}
```

#### 多窗口支持（未来）

- 主聊天窗口
- 独立的设置窗口
- 预览弹出窗口

---

## 12. 开发规范

### 12.1 代码风格

#### Rust 代码

```rust
// 使用 rustfmt 默认配置
// 运行: cargo fmt

// 命名约定
mod my_module;           // 模块名: snake_case
struct MyStruct;         // 结构体: PascalCase
fn my_function();        // 函数: snake_case
const MAX_COUNT: u32;    // 常量: SCREAMING_SNAKE_CASE

// 错误处理
// 优先使用 Result 和 ? 操作符
fn do_something() -> Result<(), MyError> {
    let value = some_fallible_operation()?;
    Ok(())
}
```

#### JavaScript 代码

```javascript
// 使用 ESLint + Prettier
// 运行: npm run lint

// 命名约定
const myVariable = 1;           // 变量: camelCase
function myFunction() {}        // 函数: camelCase
class MyClass {}                // 类: PascalCase
const MY_CONSTANT = 'value';    // 常量: SCREAMING_SNAKE_CASE

// 异步代码
// 优先使用 async/await
async function fetchData() {
    try {
        const result = await api.getData();
        return result;
    } catch (error) {
        console.error('Failed to fetch:', error);
        throw error;
    }
}
```

### 12.2 提交规范

```
类型(范围): 简短描述

详细描述（可选）

关联 Issue（可选）

---
类型:
- feat: 新功能
- fix: Bug 修复
- docs: 文档更新
- style: 代码格式
- refactor: 重构
- test: 测试
- chore: 构建/工具

范围:
- desktop: 桌面端通用
- tauri: Rust 代码
- adapter: 前端适配层
- build: 构建脚本
```

示例：

```
feat(tauri): 添加系统托盘支持

- 实现托盘菜单
- 支持最小化到托盘
- 添加托盘图标状态指示

Closes #42
```

### 12.3 分支策略

```
main
  │
  ├── desktop/develop      # 桌面端开发分支
  │     │
  │     ├── desktop/feature/tray       # 功能分支
  │     ├── desktop/feature/shortcuts
  │     └── desktop/fix/sidecar-crash
  │
  └── desktop/release/v0.1.0   # 发布分支
```

---

## 13. 测试策略

### 13.1 测试层级

```
┌─────────────────────────────────────────────┐
│              E2E Tests                       │
│  - 完整应用启动测试                          │
│  - Sidecar 启动/停止测试                    │
│  - 窗口交互测试                              │
└─────────────────────────────────────────────┘
                    ▲
┌─────────────────────────────────────────────┐
│           Integration Tests                  │
│  - IPC 命令测试                              │
│  - 前端适配层与 Tauri 集成测试              │
└─────────────────────────────────────────────┘
                    ▲
┌─────────────────────────────────────────────┐
│              Unit Tests                      │
│  - Rust 模块单元测试                        │
│  - JavaScript 适配层单元测试                │
└─────────────────────────────────────────────┘
```

### 13.2 测试命令

```bash
# Rust 单元测试
cd desktop/src-tauri && cargo test

# JavaScript 单元测试
cd desktop && npm test

# E2E 测试
cd desktop && npm run test:e2e

# 全部测试
cd desktop && npm run test:all
```

### 13.3 关键测试用例

#### Sidecar 测试

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_sidecar_start_stop() {
        let mut manager = SidecarManager::new(SidecarConfig::default());
        
        // 启动
        let port = manager.start().await.unwrap();
        assert!(port > 0);
        assert_eq!(manager.status(), SidecarStatus::Running { port, .. });
        
        // 健康检查
        assert!(manager.health_check().await.unwrap());
        
        // 停止
        manager.stop().await.unwrap();
        assert_eq!(manager.status(), SidecarStatus::Stopped);
    }

    #[tokio::test]
    async fn test_sidecar_auto_restart() {
        let mut manager = SidecarManager::new(SidecarConfig {
            max_restart_attempts: 3,
            ..Default::default()
        });
        
        manager.start().await.unwrap();
        
        // 模拟崩溃
        manager.simulate_crash();
        
        // 等待自动重启
        tokio::time::sleep(Duration::from_secs(5)).await;
        
        assert!(matches!(manager.status(), SidecarStatus::Running { .. }));
    }
}
```

#### 适配层测试

```javascript
// desktop/tests/unit/adapter.test.js

import { describe, it, expect, vi } from 'vitest';
import NativeBridge from '../../src/adapter/native-bridge.js';

describe('NativeBridge', () => {
    it('should detect non-Tauri environment', () => {
        expect(NativeBridge.isDesktop()).toBe(false);
    });

    it('should throw when invoking in non-Tauri', async () => {
        await expect(NativeBridge.invoke('test'))
            .rejects.toThrow('Not in Tauri environment');
    });
});

describe('FileSystem', () => {
    it('should fallback to input element in web mode', async () => {
        const createElementSpy = vi.spyOn(document, 'createElement');
        
        // 触发文件选择（会立即返回空数组因为没有用户交互）
        const promise = FileSystem.selectFiles();
        
        expect(createElementSpy).toHaveBeenCalledWith('input');
    });
});
```

---

## 附录

### A. 参考资源

- [Tauri 官方文档](https://tauri.app/v1/guides/)
- [PyInstaller 文档](https://pyinstaller.org/en/stable/)
- [OKCVM 主项目文档](../docs/)

### B. 术语表

| 术语 | 说明 |
|------|------|
| Sidecar | Tauri 管理的外部进程 |
| IPC | 进程间通信 (Inter-Process Communication) |
| WebView | 系统原生 Web 渲染引擎 |
| CSP | 内容安全策略 (Content Security Policy) |

### C. 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0 | 2024-XX-XX | 初始规范 |

---

*此规范由 OKCVM 团队维护，如有问题请提交 Issue。*
