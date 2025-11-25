#!/bin/bash
# OKCVM Desktop Build Script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$PROJECT_DIR")"

cd "$PROJECT_DIR"

echo "🔨 Building OKCVM Desktop..."

# 解析参数
PLATFORM=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --mac)
            PLATFORM="mac"
            shift
            ;;
        --win)
            PLATFORM="win"
            shift
            ;;
        --linux)
            PLATFORM="linux"
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    exit 1
fi

# 安装依赖
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# 打包 Python 后端
echo "🐍 Bundling Python backend..."
python "$SCRIPT_DIR/bundle-backend.py"

# 构建 Electron 应用
echo "⚡ Building Electron app..."
if [ -n "$PLATFORM" ]; then
    npm run "build:$PLATFORM"
else
    npm run build
fi

echo "✅ Build complete! Check dist/ directory for output."
