//! System Tray Management

use log::info;
use tauri::{
    AppHandle, CustomMenuItem, Manager, SystemTray, SystemTrayEvent, SystemTrayMenu,
    SystemTrayMenuItem,
};

/// 创建系统托盘
pub fn create_tray() -> SystemTray {
    let menu = SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("status", "✓ 后端运行中").disabled())
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("open", "打开主窗口"))
        .add_item(CustomMenuItem::new("new_chat", "新建对话"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("restart", "重启后端服务"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("preferences", "偏好设置..."))
        .add_item(CustomMenuItem::new("about", "关于 OKCVM"))
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(CustomMenuItem::new("quit", "退出"));

    SystemTray::new().with_menu(menu)
}

/// 处理托盘事件
pub fn handle_tray_event(app: &AppHandle, event: SystemTrayEvent) {
    match event {
        SystemTrayEvent::LeftClick { .. } => {
            info!("Tray left click - showing main window");
            show_main_window(app);
        }
        SystemTrayEvent::DoubleClick { .. } => {
            info!("Tray double click - showing main window");
            show_main_window(app);
        }
        SystemTrayEvent::MenuItemClick { id, .. } => {
            info!("Tray menu item clicked: {}", id);
            match id.as_str() {
                "open" => show_main_window(app),
                "new_chat" => create_new_chat(app),
                "restart" => restart_backend(app),
                "preferences" => open_preferences(app),
                "about" => show_about(app),
                "quit" => quit_app(app),
                _ => {}
            }
        }
        _ => {}
    }
}

/// 显示主窗口
fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// 新建对话
fn create_new_chat(app: &AppHandle) {
    show_main_window(app);
    // 发送事件到前端
    let _ = app.emit_all("new-chat", ());
}

/// 重启后端
fn restart_backend(app: &AppHandle) {
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = crate::sidecar::manager::restart_backend(&app_handle).await;
    });
}

/// 打开设置
fn open_preferences(app: &AppHandle) {
    show_main_window(app);
    let _ = app.emit_all("open-preferences", ());
}

/// 显示关于
fn show_about(app: &AppHandle) {
    let version = app.package_info().version.to_string();
    let _ = tauri::api::dialog::message(
        app.get_window("main").as_ref(),
        "关于 OKCVM",
        format!(
            "OKCVM Desktop\n\n版本: {}\n\nOK Computer in a Box: Your Self-Hosted Agent Workflow Layer",
            version
        ),
    );
}

/// 退出应用
fn quit_app(app: &AppHandle) {
    info!("Quitting application...");

    // 停止后端
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = crate::sidecar::manager::stop_backend(&app_handle).await;
    });

    // 退出
    app.exit(0);
}

/// 更新托盘状态
pub fn update_tray_status(app: &AppHandle, running: bool) {
    if let Some(tray) = app.tray_handle_by_id("main") {
        let status_text = if running {
            "✓ 后端运行中"
        } else {
            "✗ 后端已停止"
        };
        let _ = tray.get_item("status").set_title(status_text);
    }
}
