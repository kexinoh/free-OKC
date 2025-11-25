# OKCVM Desktop Development Script (Windows)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDir = Split-Path -Parent $ScriptDir
$RootDir = Split-Path -Parent $ProjectDir

Set-Location $ProjectDir

Write-Host "🚀 Starting OKCVM Desktop in development mode..." -ForegroundColor Cyan

# 检查 Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js is not installed" -ForegroundColor Red
    exit 1
}

# 检查 npm 依赖
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
    npm install
}

# 启动 Electron（开发模式）
Write-Host "⚡ Starting Electron..." -ForegroundColor Green
npm start -- --dev

Write-Host "👋 OKCVM Desktop stopped" -ForegroundColor Cyan
