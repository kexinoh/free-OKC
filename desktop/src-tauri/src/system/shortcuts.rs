//! Global Shortcuts Management

use log::{error, info};
use tauri::{AppHandle, GlobalShortcutManager, Manager};

/// 注册全局快捷键
pub fn register_shortcuts(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let mut manager = app.global_shortcut_manager();

    // 显示/隐藏窗口 - Cmd/Ctrl+Shift+K
    let app_handle = app.clone();
    manager.register("CmdOrCtrl+Shift+K", move || {
        info!("Global shortcut triggered: toggle window");
        toggle_window_visibility(&app_handle);
    })?;

    // 新建对话 - Cmd/Ctrl+Shift+N
    let app_handle = app.clone();
    manager.register("CmdOrCtrl+Shift+N", move || {
        info!("Global shortcut triggered: new chat");
        create_new_chat(&app_handle);
    })?;

    info!("Global shortcuts registered successfully");
    Ok(())
}

/// 注销所有快捷键
pub fn unregister_shortcuts(app: &AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let mut manager = app.global_shortcut_manager();
    manager.unregister_all()?;
    info!("Global shortcuts unregistered");
    Ok(())
}

/// 切换窗口可见性
fn toggle_window_visibility(app: &AppHandle) {
    if let Some(window) = app.get_window("main") {
        match window.is_visible() {
            Ok(true) => {
                let _ = window.hide();
            }
            Ok(false) => {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            Err(e) => {
                error!("Failed to check window visibility: {}", e);
            }
        }
    }
}

/// 新建对话
fn create_new_chat(app: &AppHandle) {
    // 先显示窗口
    if let Some(window) = app.get_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }

    // 发送事件到前端
    let _ = app.emit_all("new-chat", ());
}
