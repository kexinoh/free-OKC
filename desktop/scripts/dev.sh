#!/bin/bash
# OKCVM Desktop Development Script (Unix)
# 
# 启动开发环境，包括后端服务和 Tauri 开发服务器

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WORKSPACE_ROOT="$(dirname "$PROJECT_ROOT")"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 检查依赖
check_dependencies() {
    log_info "Checking dependencies..."
    
    # 检查 Rust
    if ! command -v cargo &> /dev/null; then
        log_error "Rust/Cargo not found. Please install from https://rustup.rs/"
        exit 1
    fi
    
    # 检查 Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js not found. Please install Node.js 18+"
        exit 1
    fi
    
    # 检查 Python
    if ! command -v python3 &> /dev/null; then
        log_error "Python 3 not found. Please install Python 3.9+"
        exit 1
    fi
    
    log_success "All dependencies found"
}

# 启动后端服务
start_backend() {
    log_info "Starting backend service..."
    
    cd "$WORKSPACE_ROOT"
    
    # 检查虚拟环境
    if [ -d "venv" ]; then
        source venv/bin/activate
    fi
    
    # 安装依赖（如果需要）
    pip install -e . -q
    
    # 启动后端（后台运行）
    python -m okcvm.server --host 127.0.0.1 --port 8000 &
    BACKEND_PID=$!
    echo $BACKEND_PID > /tmp/okcvm-backend.pid
    
    log_success "Backend started (PID: $BACKEND_PID)"
    
    # 等待后端就绪
    log_info "Waiting for backend to be ready..."
    for i in {1..30}; do
        if curl -s http://127.0.0.1:8000/api/health > /dev/null 2>&1; then
            log_success "Backend is ready"
            return 0
        fi
        sleep 1
    done
    
    log_error "Backend failed to start"
    return 1
}

# 停止后端服务
stop_backend() {
    if [ -f /tmp/okcvm-backend.pid ]; then
        PID=$(cat /tmp/okcvm-backend.pid)
        if kill -0 $PID 2>/dev/null; then
            log_info "Stopping backend (PID: $PID)..."
            kill $PID
            rm /tmp/okcvm-backend.pid
        fi
    fi
}

# 启动 Tauri 开发服务器
start_tauri_dev() {
    log_info "Starting Tauri development server..."
    
    cd "$PROJECT_ROOT"
    
    # 安装 npm 依赖
    if [ ! -d "node_modules" ]; then
        log_info "Installing npm dependencies..."
        npm install
    fi
    
    # 启动 Tauri dev
    npm run tauri dev
}

# 清理函数
cleanup() {
    log_info "Cleaning up..."
    stop_backend
    log_success "Cleanup complete"
}

# 捕获退出信号
trap cleanup EXIT INT TERM

# 主函数
main() {
    log_info "OKCVM Desktop Development Environment"
    echo ""
    
    check_dependencies
    
    # 启动后端
    start_backend
    
    # 启动 Tauri
    start_tauri_dev
}

# 运行
main "$@"
