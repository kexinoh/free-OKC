# OKCVM Desktop Development Script (Windows PowerShell)
#
# 启动开发环境，包括后端服务和 Tauri 开发服务器

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$WorkspaceRoot = Split-Path -Parent $ProjectRoot

# 颜色输出函数
function Write-Info($message) {
    Write-Host "[INFO] " -ForegroundColor Blue -NoNewline
    Write-Host $message
}

function Write-Success($message) {
    Write-Host "[SUCCESS] " -ForegroundColor Green -NoNewline
    Write-Host $message
}

function Write-Warn($message) {
    Write-Host "[WARN] " -ForegroundColor Yellow -NoNewline
    Write-Host $message
}

function Write-Error($message) {
    Write-Host "[ERROR] " -ForegroundColor Red -NoNewline
    Write-Host $message
}

# 检查依赖
function Check-Dependencies {
    Write-Info "Checking dependencies..."
    
    # 检查 Rust
    if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
        Write-Error "Rust/Cargo not found. Please install from https://rustup.rs/"
        exit 1
    }
    
    # 检查 Node.js
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        Write-Error "Node.js not found. Please install Node.js 18+"
        exit 1
    }
    
    # 检查 Python
    if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
        Write-Error "Python not found. Please install Python 3.9+"
        exit 1
    }
    
    Write-Success "All dependencies found"
}

# 启动后端服务
function Start-Backend {
    Write-Info "Starting backend service..."
    
    Set-Location $WorkspaceRoot
    
    # 检查虚拟环境
    if (Test-Path "venv\Scripts\Activate.ps1") {
        & "venv\Scripts\Activate.ps1"
    }
    
    # 安装依赖
    pip install -e . -q
    
    # 启动后端（后台运行）
    $BackendJob = Start-Job -ScriptBlock {
        param($WorkspaceRoot)
        Set-Location $WorkspaceRoot
        python -m okcvm.server --host 127.0.0.1 --port 8000
    } -ArgumentList $WorkspaceRoot
    
    $BackendJob.Id | Out-File -FilePath "$env:TEMP\okcvm-backend.pid"
    
    Write-Success "Backend started (Job ID: $($BackendJob.Id))"
    
    # 等待后端就绪
    Write-Info "Waiting for backend to be ready..."
    for ($i = 1; $i -le 30; $i++) {
        try {
            $response = Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/health" -UseBasicParsing -TimeoutSec 1 -ErrorAction SilentlyContinue
            if ($response.StatusCode -eq 200) {
                Write-Success "Backend is ready"
                return
            }
        } catch {
            # 继续等待
        }
        Start-Sleep -Seconds 1
    }
    
    Write-Error "Backend failed to start"
    exit 1
}

# 停止后端服务
function Stop-Backend {
    $pidFile = "$env:TEMP\okcvm-backend.pid"
    if (Test-Path $pidFile) {
        $jobId = Get-Content $pidFile
        Write-Info "Stopping backend (Job ID: $jobId)..."
        Stop-Job -Id $jobId -ErrorAction SilentlyContinue
        Remove-Job -Id $jobId -Force -ErrorAction SilentlyContinue
        Remove-Item $pidFile
    }
}

# 启动 Tauri 开发服务器
function Start-TauriDev {
    Write-Info "Starting Tauri development server..."
    
    Set-Location $ProjectRoot
    
    # 安装 npm 依赖
    if (-not (Test-Path "node_modules")) {
        Write-Info "Installing npm dependencies..."
        npm install
    }
    
    # 启动 Tauri dev
    npm run tauri dev
}

# 主函数
function Main {
    Write-Info "OKCVM Desktop Development Environment"
    Write-Host ""
    
    Check-Dependencies
    
    try {
        # 启动后端
        Start-Backend
        
        # 启动 Tauri
        Start-TauriDev
    }
    finally {
        # 清理
        Write-Info "Cleaning up..."
        Stop-Backend
        Write-Success "Cleanup complete"
    }
}

# 运行
Main
