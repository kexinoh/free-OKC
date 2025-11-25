#!/bin/bash
# OKCVM Desktop Production Build Script (Unix)
#
# 构建生产版本的桌面应用

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WORKSPACE_ROOT="$(dirname "$PROJECT_ROOT")"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# 检测平台
detect_platform() {
    case "$(uname -s)" in
        Darwin*)
            if [[ "$(uname -m)" == "arm64" ]]; then
                echo "aarch64-apple-darwin"
            else
                echo "x86_64-apple-darwin"
            fi
            ;;
        Linux*)
            echo "x86_64-unknown-linux-gnu"
            ;;
        MINGW*|MSYS*|CYGWIN*)
            echo "x86_64-pc-windows-msvc"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

# 检查依赖
check_dependencies() {
    log_info "Checking build dependencies..."
    
    # 检查 Rust
    if ! command -v cargo &> /dev/null; then
        log_error "Rust/Cargo not found"
        exit 1
    fi
    
    # 检查 Node.js
    if ! command -v node &> /dev/null; then
        log_error "Node.js not found"
        exit 1
    fi
    
    # 检查 Python
    if ! command -v python3 &> /dev/null; then
        log_error "Python 3 not found"
        exit 1
    fi
    
    # 检查 PyInstaller
    if ! python3 -c "import PyInstaller" &> /dev/null; then
        log_warn "PyInstaller not found, installing..."
        pip3 install pyinstaller
    fi
    
    log_success "All dependencies found"
}

# 打包 Python 后端
bundle_backend() {
    log_info "Bundling Python backend..."
    
    cd "$WORKSPACE_ROOT"
    
    # 激活虚拟环境（如果存在）
    if [ -d "venv" ]; then
        source venv/bin/activate
    fi
    
    # 运行打包脚本
    python3 "$SCRIPT_DIR/bundle-backend.py" --target "$1"
    
    log_success "Backend bundled successfully"
}

# 构建 Tauri 应用
build_tauri() {
    log_info "Building Tauri application..."
    
    cd "$PROJECT_ROOT"
    
    # 安装 npm 依赖
    if [ ! -d "node_modules" ]; then
        npm install
    fi
    
    # 构建
    npm run tauri build
    
    log_success "Tauri build complete"
}

# 显示构建产物
show_artifacts() {
    log_info "Build artifacts:"
    
    BUNDLE_DIR="$PROJECT_ROOT/src-tauri/target/release/bundle"
    
    if [ -d "$BUNDLE_DIR" ]; then
        find "$BUNDLE_DIR" -type f \( -name "*.dmg" -o -name "*.app" -o -name "*.msi" -o -name "*.exe" -o -name "*.AppImage" -o -name "*.deb" \) 2>/dev/null | while read file; do
            SIZE=$(du -h "$file" | cut -f1)
            echo "  📦 $file ($SIZE)"
        done
    fi
}

# 主函数
main() {
    log_info "OKCVM Desktop Production Build"
    echo ""
    
    PLATFORM=$(detect_platform)
    log_info "Target platform: $PLATFORM"
    echo ""
    
    check_dependencies
    
    # 打包后端
    bundle_backend "$PLATFORM"
    
    # 构建 Tauri
    build_tauri
    
    echo ""
    show_artifacts
    
    echo ""
    log_success "Build complete!"
}

# 解析参数
while [[ $# -gt 0 ]]; do
    case $1 in
        --target)
            PLATFORM="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [--target <platform>]"
            echo ""
            echo "Platforms:"
            echo "  x86_64-apple-darwin      macOS (Intel)"
            echo "  aarch64-apple-darwin     macOS (Apple Silicon)"
            echo "  x86_64-pc-windows-msvc   Windows"
            echo "  x86_64-unknown-linux-gnu Linux"
            exit 0
            ;;
        *)
            shift
            ;;
    esac
done

# 运行
main
