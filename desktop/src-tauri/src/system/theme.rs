//! System Theme Detection

use log::info;
use tauri::{AppHandle, Manager};

/// 主题类型
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Theme {
    Light,
    Dark,
}

impl Theme {
    pub fn as_str(&self) -> &'static str {
        match self {
            Theme::Light => "light",
            Theme::Dark => "dark",
        }
    }
}

/// 获取系统主题
pub fn get_system_theme() -> Theme {
    #[cfg(target_os = "macos")]
    {
        // macOS: 检查 AppleInterfaceStyle
        use std::process::Command;
        let output = Command::new("defaults")
            .args(["read", "-g", "AppleInterfaceStyle"])
            .output();

        if let Ok(output) = output {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if stdout.trim().to_lowercase() == "dark" {
                return Theme::Dark;
            }
        }
        Theme::Light
    }

    #[cfg(target_os = "windows")]
    {
        // Windows: 检查注册表
        use std::process::Command;
        let output = Command::new("reg")
            .args([
                "query",
                "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
                "/v",
                "AppsUseLightTheme",
            ])
            .output();

        if let Ok(output) = output {
            let stdout = String::from_utf8_lossy(&output.stdout);
            if stdout.contains("0x0") {
                return Theme::Dark;
            }
        }
        Theme::Light
    }

    #[cfg(target_os = "linux")]
    {
        // Linux: 检查 GTK 主题或环境变量
        if let Ok(theme) = std::env::var("GTK_THEME") {
            if theme.to_lowercase().contains("dark") {
                return Theme::Dark;
            }
        }
        Theme::Light
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        Theme::Light
    }
}

/// 通知前端主题变化
pub fn notify_theme_change(app: &AppHandle, theme: Theme) {
    info!("System theme changed to: {:?}", theme);
    let _ = app.emit_all("theme-changed", theme.as_str());
}

/// 获取系统主题命令
#[tauri::command]
pub fn get_system_theme_cmd() -> String {
    get_system_theme().as_str().to_string()
}
