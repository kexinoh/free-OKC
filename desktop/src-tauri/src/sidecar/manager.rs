//! Sidecar Process Manager
//!
//! Manages the lifecycle of the Python backend process.

use super::health;
use crate::state::{AppState, BackendStatus};
use crate::utils::port::find_available_port;
use log::{error, info, warn};
use std::sync::Arc;
use std::time::Duration;
use tauri::api::process::{Command, CommandChild, CommandEvent};
use tauri::{AppHandle, Manager};
use thiserror::Error;
use tokio::sync::Mutex;
use tokio::time::timeout;

/// Sidecar 管理错误
#[derive(Debug, Error)]
pub enum SidecarError {
    #[error("Failed to spawn sidecar: {0}")]
    SpawnError(String),

    #[error("Sidecar startup timeout")]
    StartupTimeout,

    #[error("Failed to find available port")]
    PortError,

    #[error("Health check failed: {0}")]
    HealthCheckFailed(String),

    #[error("Sidecar not running")]
    NotRunning,

    #[error("Operation failed: {0}")]
    OperationFailed(String),
}

/// Sidecar 配置
pub struct SidecarConfig {
    /// 健康检查间隔（毫秒）
    pub health_check_interval: u64,
    /// 启动超时（毫秒）
    pub startup_timeout: u64,
    /// 最大重启次数
    pub max_restart_attempts: u32,
    /// 端口范围起始
    pub port_range_start: u16,
    /// 端口范围结束
    pub port_range_end: u16,
}

impl Default for SidecarConfig {
    fn default() -> Self {
        Self {
            health_check_interval: 5000,
            startup_timeout: 30000,
            max_restart_attempts: 3,
            port_range_start: 8000,
            port_range_end: 9000,
        }
    }
}

/// 全局 sidecar 子进程句柄
static SIDECAR_CHILD: once_cell::sync::Lazy<Mutex<Option<CommandChild>>> =
    once_cell::sync::Lazy::new(|| Mutex::new(None));

/// 启动后端服务
pub async fn start_backend(app: &AppHandle) -> Result<u16, SidecarError> {
    let config = SidecarConfig::default();
    let state = app.state::<Arc<AppState>>();

    // 检查是否已在运行
    if let BackendStatus::Running { port, .. } = state.get_backend_status() {
        info!("Backend already running on port {}", port);
        return Ok(port);
    }

    // 更新状态为启动中
    state.set_backend_status(BackendStatus::Starting);

    // 查找可用端口
    let port = find_available_port(config.port_range_start, config.port_range_end)
        .ok_or(SidecarError::PortError)?;

    info!("Starting backend on port {}", port);

    // 获取数据目录
    let data_dir = app
        .path_resolver()
        .app_data_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."));

    // 构建启动参数
    let args = vec![
        "--host".to_string(),
        "127.0.0.1".to_string(),
        "--port".to_string(),
        port.to_string(),
        "--data-dir".to_string(),
        data_dir.to_string_lossy().to_string(),
    ];

    // 启动 sidecar 进程
    let (mut rx, child) = Command::new_sidecar("okcvm-server")
        .map_err(|e| SidecarError::SpawnError(e.to_string()))?
        .args(&args)
        .spawn()
        .map_err(|e| SidecarError::SpawnError(e.to_string()))?;

    let pid = child.pid();
    info!("Sidecar spawned with PID: {}", pid);

    // 保存子进程句柄
    {
        let mut guard = SIDECAR_CHILD.lock().await;
        *guard = Some(child);
    }

    // 监听 sidecar 输出
    let app_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    info!("[Backend] {}", line);
                }
                CommandEvent::Stderr(line) => {
                    warn!("[Backend STDERR] {}", line);
                }
                CommandEvent::Error(err) => {
                    error!("[Backend ERROR] {}", err);
                }
                CommandEvent::Terminated(payload) => {
                    let code = payload.code.unwrap_or(-1);
                    warn!("[Backend] Process terminated with code: {}", code);

                    // 更新状态
                    if let Some(state) = app_handle.try_state::<Arc<AppState>>() {
                        state.set_backend_status(BackendStatus::Stopped);
                        state.set_backend_port(None);
                    }

                    // 通知前端
                    let _ = app_handle.emit_all("backend-stopped", code);
                }
                _ => {}
            }
        }
    });

    // 等待后端就绪
    let ready = timeout(
        Duration::from_millis(config.startup_timeout),
        wait_for_backend_ready(port),
    )
    .await
    .map_err(|_| SidecarError::StartupTimeout)?
    .map_err(|e| SidecarError::HealthCheckFailed(e.to_string()))?;

    if ready {
        state.set_backend_status(BackendStatus::Running {
            port,
            pid: Some(pid),
        });
        state.set_backend_port(Some(port));
        info!("Backend is ready on port {}", port);
        Ok(port)
    } else {
        state.set_backend_status(BackendStatus::Failed {
            error: "Health check failed".to_string(),
        });
        Err(SidecarError::HealthCheckFailed(
            "Backend failed to become ready".to_string(),
        ))
    }
}

/// 等待后端就绪
async fn wait_for_backend_ready(port: u16) -> Result<bool, String> {
    let url = format!("http://127.0.0.1:{}/api/health", port);
    let max_attempts = 60; // 最多尝试 60 次
    let interval = Duration::from_millis(500);

    for attempt in 1..=max_attempts {
        match health::check_health(&url).await {
            Ok(true) => {
                info!("Backend health check passed on attempt {}", attempt);
                return Ok(true);
            }
            Ok(false) => {
                info!(
                    "Backend health check returned unhealthy on attempt {}",
                    attempt
                );
            }
            Err(e) => {
                if attempt % 10 == 0 {
                    info!(
                        "Backend not ready yet (attempt {}): {}",
                        attempt,
                        e
                    );
                }
            }
        }
        tokio::time::sleep(interval).await;
    }

    Err("Backend failed to become ready within timeout".to_string())
}

/// 停止后端服务
pub async fn stop_backend(app: &AppHandle) -> Result<(), SidecarError> {
    let state = app.state::<Arc<AppState>>();

    // 更新状态
    state.set_backend_status(BackendStatus::Stopping);

    // 终止子进程
    let mut guard = SIDECAR_CHILD.lock().await;
    if let Some(child) = guard.take() {
        info!("Killing sidecar process...");
        if let Err(e) = child.kill() {
            error!("Failed to kill sidecar: {}", e);
            return Err(SidecarError::OperationFailed(e.to_string()));
        }
    }

    state.set_backend_status(BackendStatus::Stopped);
    state.set_backend_port(None);

    info!("Backend stopped");
    Ok(())
}

/// 重启后端服务
pub async fn restart_backend(app: &AppHandle) -> Result<u16, SidecarError> {
    info!("Restarting backend...");

    // 先停止
    if let Err(e) = stop_backend(app).await {
        warn!("Error stopping backend during restart: {}", e);
    }

    // 等待一小段时间确保资源释放
    tokio::time::sleep(Duration::from_millis(1000)).await;

    // 重新启动
    start_backend(app).await
}

/// 获取后端状态
pub fn get_backend_status(app: &AppHandle) -> BackendStatus {
    app.state::<Arc<AppState>>().get_backend_status()
}

/// 获取后端 URL
pub fn get_backend_url(app: &AppHandle) -> Option<String> {
    app.state::<Arc<AppState>>().get_backend_url()
}
