//! Path Utilities

use std::path::PathBuf;

/// 获取应用数据目录
pub fn get_app_data_dir() -> Option<PathBuf> {
    dirs::data_dir().map(|p| p.join("okcvm"))
}

/// 获取应用配置目录
pub fn get_app_config_dir() -> Option<PathBuf> {
    dirs::config_dir().map(|p| p.join("okcvm"))
}

/// 获取应用日志目录
pub fn get_app_log_dir() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        dirs::home_dir().map(|p| p.join("Library/Logs/OKCVM"))
    }

    #[cfg(target_os = "windows")]
    {
        dirs::data_dir().map(|p| p.join("okcvm/logs"))
    }

    #[cfg(target_os = "linux")]
    {
        dirs::data_dir().map(|p| p.join("okcvm/logs"))
    }

    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        None
    }
}

/// 获取应用缓存目录
pub fn get_app_cache_dir() -> Option<PathBuf> {
    dirs::cache_dir().map(|p| p.join("okcvm"))
}

/// 确保目录存在
pub fn ensure_dir_exists(path: &PathBuf) -> std::io::Result<()> {
    if !path.exists() {
        std::fs::create_dir_all(path)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_app_data_dir() {
        let dir = get_app_data_dir();
        assert!(dir.is_some());
    }

    #[test]
    fn test_get_app_config_dir() {
        let dir = get_app_config_dir();
        assert!(dir.is_some());
    }
}
