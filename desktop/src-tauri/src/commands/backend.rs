//! Backend Management Commands

use crate::sidecar;
use crate::state::{AppState, BackendStatus};
use std::sync::Arc;
use tauri::{AppHandle, State};

/// 获取后端 URL
#[tauri::command]
pub async fn get_backend_url(state: State<'_, Arc<AppState>>) -> Result<String, String> {
    state
        .get_backend_url()
        .ok_or_else(|| "Backend not running".to_string())
}

/// 获取后端状态
#[tauri::command]
pub async fn get_backend_status(state: State<'_, Arc<AppState>>) -> Result<BackendStatus, String> {
    Ok(state.get_backend_status())
}

/// 重启后端服务
#[tauri::command]
pub async fn restart_backend(app: AppHandle) -> Result<u16, String> {
    sidecar::manager::restart_backend(&app)
        .await
        .map_err(|e| e.to_string())
}

/// 停止后端服务
#[tauri::command]
pub async fn stop_backend(app: AppHandle) -> Result<(), String> {
    sidecar::manager::stop_backend(&app)
        .await
        .map_err(|e| e.to_string())
}
