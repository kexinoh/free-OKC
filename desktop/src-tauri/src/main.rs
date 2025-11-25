// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod sidecar;
mod state;
mod system;
mod utils;

use log::{error, info};
use state::AppState;
use std::sync::Arc;
use tauri::{Manager, SystemTray, SystemTrayEvent};

fn main() {
    // 初始化日志
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    info!("Starting OKCVM Desktop...");

    // 创建系统托盘
    let system_tray = system::tray::create_tray();

    // 构建应用
    tauri::Builder::default()
        .system_tray(system_tray)
        .on_system_tray_event(handle_tray_event)
        .setup(|app| {
            info!("Setting up application...");

            // 初始化应用状态
            let app_state = Arc::new(AppState::new());
            app.manage(app_state.clone());

            // 启动后端服务
            let app_handle = app.handle();
            tauri::async_runtime::spawn(async move {
                match sidecar::manager::start_backend(&app_handle).await {
                    Ok(port) => {
                        info!("Backend started on port {}", port);
                        // 通知前端后端已就绪
                        let _ = app_handle.emit_all("backend-ready", port);
                    }
                    Err(e) => {
                        error!("Failed to start backend: {}", e);
                        let _ = app_handle.emit_all("backend-error", e.to_string());
                    }
                }
            });

            // 注册全局快捷键
            let app_handle = app.handle();
            if let Err(e) = system::shortcuts::register_shortcuts(&app_handle) {
                error!("Failed to register shortcuts: {}", e);
            }

            info!("Application setup complete");
            Ok(())
        })
        .on_window_event(|event| {
            // 处理窗口关闭事件（最小化到托盘）
            if let tauri::WindowEvent::CloseRequested { api, .. } = event.event() {
                // 隐藏窗口而不是关闭
                event.window().hide().unwrap();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::backend::get_backend_url,
            commands::backend::get_backend_status,
            commands::backend::restart_backend,
            commands::backend::stop_backend,
            commands::files::read_local_file,
            commands::files::write_local_file,
            commands::files::get_file_info,
            commands::config::get_app_config,
            commands::config::set_app_config,
            commands::config::get_app_version,
            commands::config::get_data_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// 处理系统托盘事件
fn handle_tray_event(app: &tauri::AppHandle, event: SystemTrayEvent) {
    system::tray::handle_tray_event(app, event);
}
