//! File Operation Commands

use log::info;
use serde::Serialize;
use std::fs;
use std::path::Path;

/// 文件信息
#[derive(Debug, Serialize)]
pub struct FileInfo {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub is_dir: bool,
    pub modified: Option<u64>,
}

/// 读取本地文件
#[tauri::command]
pub async fn read_local_file(path: String) -> Result<Vec<u8>, String> {
    info!("Reading file: {}", path);
    fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))
}

/// 写入本地文件
#[tauri::command]
pub async fn write_local_file(path: String, data: Vec<u8>) -> Result<bool, String> {
    info!("Writing file: {} ({} bytes)", path, data.len());

    // 确保父目录存在
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create directory: {}", e))?;
        }
    }

    fs::write(&path, data).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(true)
}

/// 获取文件信息
#[tauri::command]
pub async fn get_file_info(path: String) -> Result<FileInfo, String> {
    let path_obj = Path::new(&path);
    let metadata = fs::metadata(path_obj).map_err(|e| format!("Failed to get file info: {}", e))?;

    let name = path_obj
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();

    let modified = metadata
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs());

    Ok(FileInfo {
        name,
        path: path.clone(),
        size: metadata.len(),
        is_dir: metadata.is_dir(),
        modified,
    })
}
