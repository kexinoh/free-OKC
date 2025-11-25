//! Backend Health Check

use log::debug;
use serde::Deserialize;
use std::time::Duration;

/// 健康检查响应
#[derive(Debug, Deserialize)]
pub struct HealthResponse {
    pub status: String,
    #[serde(default)]
    pub version: Option<String>,
}

/// 检查后端健康状态
pub async fn check_health(url: &str) -> Result<bool, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(url).send().await.map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Ok(false);
    }

    let health: HealthResponse = response.json().await.map_err(|e| e.to_string())?;

    debug!("Health check response: {:?}", health);

    Ok(health.status == "healthy" || health.status == "ok")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_health_check_invalid_url() {
        let result = check_health("http://127.0.0.1:99999/api/health").await;
        assert!(result.is_err());
    }
}
