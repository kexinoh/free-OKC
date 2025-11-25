//! Port Discovery Utilities

use log::debug;
use std::net::TcpListener;

/// 查找可用端口
pub fn find_available_port(start: u16, end: u16) -> Option<u16> {
    for port in start..=end {
        if is_port_available(port) {
            debug!("Found available port: {}", port);
            return Some(port);
        }
    }
    None
}

/// 检查端口是否可用
pub fn is_port_available(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_available_port() {
        let port = find_available_port(49152, 49160);
        assert!(port.is_some());
    }

    #[test]
    fn test_is_port_available() {
        // 找一个可用端口
        let port = find_available_port(49152, 49160).unwrap();
        assert!(is_port_available(port));

        // 绑定后不可用
        let _listener = TcpListener::bind(("127.0.0.1", port)).unwrap();
        assert!(!is_port_available(port));
    }
}
