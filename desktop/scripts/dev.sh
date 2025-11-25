#!/bin/bash
# OKCVM Desktop Development Script

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ROOT_DIR="$(dirname "$PROJECT_DIR")"

cd "$PROJECT_DIR"

echo "🚀 Starting OKCVM Desktop in development mode..."

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    exit 1
fi

# 检查 npm 依赖
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# 启动 Python 后端（在后台）
echo "🐍 Starting Python backend..."
cd "$ROOT_DIR"

# 检查虚拟环境
if [ -d ".venv" ]; then
    source .venv/bin/activate
elif [ -d "venv" ]; then
    source venv/bin/activate
fi

# 启动后端（开发模式由 Electron 管理）
# python main.py --port 8000 &
# BACKEND_PID=$!

cd "$PROJECT_DIR"

# 启动 Electron（开发模式）
echo "⚡ Starting Electron..."
npm start -- --dev

# 清理后端进程
# if [ -n "$BACKEND_PID" ]; then
#     kill $BACKEND_PID 2>/dev/null || true
# fi

echo "👋 OKCVM Desktop stopped"
