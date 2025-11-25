//! Global Application State

use parking_lot::RwLock;
use serde::{Deserialize, Serialize};

/// 后端服务状态
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum BackendStatus {
    /// 正在启动
    Starting,
    /// 运行中
    Running {
        port: u16,
        #[serde(skip_serializing_if = "Option::is_none")]
        pid: Option<u32>,
    },
    /// 正在停止
    Stopping,
    /// 已停止
    Stopped,
    /// 启动失败
    Failed { error: String },
}

impl Default for BackendStatus {
    fn default() -> Self {
        Self::Stopped
    }
}

/// 应用配置
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    /// 窗口配置
    pub window: WindowConfig,
    /// 外观配置
    pub appearance: AppearanceConfig,
    /// 快捷键配置
    pub shortcuts: ShortcutsConfig,
    /// 后端配置
    pub backend: BackendConfig,
    /// 更新配置
    pub updates: UpdatesConfig,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            window: WindowConfig::default(),
            appearance: AppearanceConfig::default(),
            shortcuts: ShortcutsConfig::default(),
            backend: BackendConfig::default(),
            updates: UpdatesConfig::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WindowConfig {
    pub width: u32,
    pub height: u32,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub maximized: bool,
}

impl Default for WindowConfig {
    fn default() -> Self {
        Self {
            width: 1400,
            height: 900,
            x: None,
            y: None,
            maximized: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppearanceConfig {
    /// 主题: "light", "dark", "system"
    pub theme: String,
    /// 字体大小
    pub font_size: u32,
}

impl Default for AppearanceConfig {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
            font_size: 14,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortcutsConfig {
    pub toggle_window: String,
    pub new_chat: String,
}

impl Default for ShortcutsConfig {
    fn default() -> Self {
        Self {
            toggle_window: "CmdOrCtrl+Shift+K".to_string(),
            new_chat: "CmdOrCtrl+Shift+N".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackendConfig {
    /// 是否自动启动后端
    pub auto_start: bool,
    /// 固定端口（None 表示自动分配）
    pub port: Option<u16>,
}

impl Default for BackendConfig {
    fn default() -> Self {
        Self {
            auto_start: true,
            port: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdatesConfig {
    /// 是否自动检查更新
    pub auto_check: bool,
    /// 更新渠道: "stable", "beta"
    pub channel: String,
}

impl Default for UpdatesConfig {
    fn default() -> Self {
        Self {
            auto_check: true,
            channel: "stable".to_string(),
        }
    }
}

/// 全局应用状态
pub struct AppState {
    /// 后端状态
    backend_status: RwLock<BackendStatus>,
    /// 后端端口
    backend_port: RwLock<Option<u16>>,
    /// 应用配置
    config: RwLock<AppConfig>,
}

impl AppState {
    /// 创建新的应用状态
    pub fn new() -> Self {
        Self {
            backend_status: RwLock::new(BackendStatus::default()),
            backend_port: RwLock::new(None),
            config: RwLock::new(AppConfig::default()),
        }
    }

    /// 获取后端状态
    pub fn get_backend_status(&self) -> BackendStatus {
        self.backend_status.read().clone()
    }

    /// 设置后端状态
    pub fn set_backend_status(&self, status: BackendStatus) {
        *self.backend_status.write() = status;
    }

    /// 获取后端端口
    pub fn get_backend_port(&self) -> Option<u16> {
        *self.backend_port.read()
    }

    /// 设置后端端口
    pub fn set_backend_port(&self, port: Option<u16>) {
        *self.backend_port.write() = port;
    }

    /// 获取后端 URL
    pub fn get_backend_url(&self) -> Option<String> {
        self.backend_port
            .read()
            .map(|port| format!("http://127.0.0.1:{}", port))
    }

    /// 获取应用配置
    pub fn get_config(&self) -> AppConfig {
        self.config.read().clone()
    }

    /// 设置应用配置
    pub fn set_config(&self, config: AppConfig) {
        *self.config.write() = config;
    }

    /// 更新应用配置
    pub fn update_config<F>(&self, f: F)
    where
        F: FnOnce(&mut AppConfig),
    {
        let mut config = self.config.write();
        f(&mut config);
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_state_default() {
        let state = AppState::new();
        assert_eq!(state.get_backend_status(), BackendStatus::Stopped);
        assert_eq!(state.get_backend_port(), None);
    }

    #[test]
    fn test_backend_status_update() {
        let state = AppState::new();
        state.set_backend_status(BackendStatus::Running {
            port: 8080,
            pid: Some(1234),
        });
        assert!(matches!(
            state.get_backend_status(),
            BackendStatus::Running { port: 8080, .. }
        ));
    }

    #[test]
    fn test_backend_url() {
        let state = AppState::new();
        assert_eq!(state.get_backend_url(), None);

        state.set_backend_port(Some(8080));
        assert_eq!(
            state.get_backend_url(),
            Some("http://127.0.0.1:8080".to_string())
        );
    }
}
