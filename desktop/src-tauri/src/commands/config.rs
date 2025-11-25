//! Configuration Commands

use crate::state::{AppConfig, AppState};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

/// 获取应用配置
#[tauri::command]
pub async fn get_app_config(state: State<'_, Arc<AppState>>) -> Result<AppConfig, String> {
    Ok(state.get_config())
}

/// 设置应用配置
#[tauri::command]
pub async fn set_app_config(
    state: State<'_, Arc<AppState>>,
    config: AppConfig,
) -> Result<bool, String> {
    state.set_config(config);
    // TODO: 持久化配置到文件
    Ok(true)
}

/// 获取应用版本
#[tauri::command]
pub async fn get_app_version(app: AppHandle) -> Result<String, String> {
    Ok(app.package_info().version.to_string())
}

/// 获取数据目录路径
#[tauri::command]
pub async fn get_data_dir(app: AppHandle) -> Result<String, String> {
    app.path_resolver()
        .app_data_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Failed to get data directory".to_string())
}
