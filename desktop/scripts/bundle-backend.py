#!/usr/bin/env python3
"""
OKCVM Backend Bundling Script

使用 PyInstaller 将 Python 后端打包为可执行文件。
"""

import argparse
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

# 项目路径
SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPT_DIR.parent
WORKSPACE_ROOT = PROJECT_ROOT.parent
SRC_DIR = WORKSPACE_ROOT / "src"
SPEC_DIR = WORKSPACE_ROOT / "spec"
FRONTEND_DIR = WORKSPACE_ROOT / "frontend"
BACKEND_BUNDLE_DIR = PROJECT_ROOT / "backend-bundle"
OUTPUT_DIR = PROJECT_ROOT / "src-tauri" / "binaries"

# 平台映射
PLATFORM_MAP = {
    "Darwin-x86_64": "x86_64-apple-darwin",
    "Darwin-arm64": "aarch64-apple-darwin",
    "Linux-x86_64": "x86_64-unknown-linux-gnu",
    "Windows-AMD64": "x86_64-pc-windows-msvc",
}


def get_current_platform():
    """获取当前平台标识"""
    system = platform.system()
    machine = platform.machine()
    key = f"{system}-{machine}"
    return PLATFORM_MAP.get(key, "unknown")


def get_exe_extension(target):
    """获取可执行文件扩展名"""
    if "windows" in target:
        return ".exe"
    return ""


def get_exe_name(target):
    """获取 Tauri sidecar 所需的可执行文件名"""
    ext = get_exe_extension(target)
    return f"okcvm-server-{target}{ext}"


def run_pyinstaller(target):
    """运行 PyInstaller 打包"""
    print(f"[INFO] Running PyInstaller for target: {target}")
    
    # 确保输出目录存在
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # PyInstaller 参数
    entry_point = SRC_DIR / "okcvm" / "server.py"
    
    # 构建数据文件参数
    datas = [
        (str(SPEC_DIR), "spec"),
        (str(FRONTEND_DIR), "frontend"),
    ]
    
    # 构建隐式导入
    hidden_imports = [
        "okcvm",
        "okcvm.api",
        "okcvm.api.main",
        "okcvm.tools",
        "okcvm.tools.shell",
        "okcvm.tools.files",
        "okcvm.tools.browser",
        "okcvm.tools.deployment",
        "okcvm.tools.slides",
        "okcvm.storage",
        "okcvm.storage.conversations",
        "uvicorn.logging",
        "uvicorn.protocols.http",
        "uvicorn.protocols.websockets",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "uvicorn.lifespan.off",
        "sqlalchemy.dialects.sqlite",
        "langchain",
        "langchain_openai",
        "engineio.async_drivers.threading",
    ]
    
    # 构建命令
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--name", "okcvm-server",
        "--onedir",  # 使用目录模式
        "--console",  # 保留控制台
        "--clean",
        "--noconfirm",
        f"--distpath={OUTPUT_DIR}",
        f"--workpath={PROJECT_ROOT / 'build'}",
        f"--specpath={BACKEND_BUNDLE_DIR}",
    ]
    
    # 添加数据文件
    for src, dst in datas:
        if Path(src).exists():
            cmd.extend(["--add-data", f"{src}{os.pathsep}{dst}"])
    
    # 添加隐式导入
    for imp in hidden_imports:
        cmd.extend(["--hidden-import", imp])
    
    # 添加源码路径
    cmd.extend(["--paths", str(SRC_DIR)])
    
    # 添加入口点
    cmd.append(str(entry_point))
    
    print(f"[INFO] Command: {' '.join(cmd)}")
    
    # 执行
    result = subprocess.run(cmd, cwd=WORKSPACE_ROOT)
    
    if result.returncode != 0:
        print("[ERROR] PyInstaller failed")
        sys.exit(1)
    
    print("[SUCCESS] PyInstaller completed")


def post_process(target):
    """后处理：重命名和整理文件"""
    print("[INFO] Post-processing...")
    
    # PyInstaller 输出目录
    pyinstaller_output = OUTPUT_DIR / "okcvm-server"
    
    if not pyinstaller_output.exists():
        print(f"[ERROR] PyInstaller output not found: {pyinstaller_output}")
        sys.exit(1)
    
    # 目标文件名
    target_name = get_exe_name(target)
    target_path = OUTPUT_DIR / target_name
    
    # 对于 onedir 模式，我们需要处理整个目录
    # Tauri sidecar 需要单个可执行文件，所以我们使用 onefile 模式或创建启动器
    
    # 查找主可执行文件
    ext = get_exe_extension(target)
    main_exe = pyinstaller_output / f"okcvm-server{ext}"
    
    if main_exe.exists():
        # 复制主可执行文件
        shutil.copy2(main_exe, target_path)
        print(f"[INFO] Created: {target_path}")
        
        # 复制依赖目录（如果 Tauri 支持）
        # 注意：标准 Tauri sidecar 期望单个可执行文件
        # 对于复杂的 Python 应用，可能需要其他打包方式
    else:
        print(f"[WARN] Main executable not found, trying onefile build...")
        # 重新以 onefile 模式构建
        run_pyinstaller_onefile(target)


def run_pyinstaller_onefile(target):
    """使用 onefile 模式重新构建"""
    print(f"[INFO] Running PyInstaller (onefile) for target: {target}")
    
    entry_point = SRC_DIR / "okcvm" / "server.py"
    target_name = get_exe_name(target)
    
    # onefile 模式命令
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--name", target_name.replace(get_exe_extension(target), ""),
        "--onefile",
        "--console",
        "--clean",
        "--noconfirm",
        f"--distpath={OUTPUT_DIR}",
        f"--workpath={PROJECT_ROOT / 'build'}",
        f"--specpath={BACKEND_BUNDLE_DIR}",
        "--paths", str(SRC_DIR),
    ]
    
    # 添加数据文件
    datas = [
        (str(SPEC_DIR), "spec"),
        (str(FRONTEND_DIR), "frontend"),
    ]
    for src, dst in datas:
        if Path(src).exists():
            cmd.extend(["--add-data", f"{src}{os.pathsep}{dst}"])
    
    # 添加隐式导入
    hidden_imports = [
        "okcvm", "okcvm.api", "okcvm.api.main",
        "uvicorn.logging", "uvicorn.protocols.http",
        "sqlalchemy.dialects.sqlite",
    ]
    for imp in hidden_imports:
        cmd.extend(["--hidden-import", imp])
    
    cmd.append(str(entry_point))
    
    result = subprocess.run(cmd, cwd=WORKSPACE_ROOT)
    
    if result.returncode != 0:
        print("[ERROR] PyInstaller (onefile) failed")
        sys.exit(1)


def clean_build():
    """清理构建产物"""
    print("[INFO] Cleaning build artifacts...")
    
    build_dir = PROJECT_ROOT / "build"
    if build_dir.exists():
        shutil.rmtree(build_dir)
    
    # 清理 PyInstaller 临时文件
    for pattern in ["*.spec", "*.log"]:
        for f in BACKEND_BUNDLE_DIR.glob(pattern):
            if "okcvm-server.spec" not in str(f):  # 保留模板
                f.unlink()


def main():
    parser = argparse.ArgumentParser(description="Bundle OKCVM Python backend")
    parser.add_argument(
        "--target",
        default=get_current_platform(),
        help="Target platform (e.g., x86_64-apple-darwin)",
    )
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Clean build artifacts before building",
    )
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("OKCVM Backend Bundler")
    print("=" * 60)
    print(f"Target: {args.target}")
    print(f"Output: {OUTPUT_DIR}")
    print("=" * 60)
    
    if args.clean:
        clean_build()
    
    # 运行打包
    run_pyinstaller_onefile(args.target)
    
    # 验证输出
    target_name = get_exe_name(args.target)
    target_path = OUTPUT_DIR / target_name
    
    if target_path.exists():
        size = target_path.stat().st_size / (1024 * 1024)
        print(f"\n[SUCCESS] Bundle created: {target_path} ({size:.1f} MB)")
    else:
        # 检查是否生成了其他名称的文件
        for f in OUTPUT_DIR.iterdir():
            if f.is_file() and "okcvm" in f.name:
                # 重命名为正确的名称
                shutil.move(f, target_path)
                size = target_path.stat().st_size / (1024 * 1024)
                print(f"\n[SUCCESS] Bundle created: {target_path} ({size:.1f} MB)")
                break
        else:
            print(f"\n[ERROR] Bundle not found at expected location")
            sys.exit(1)


if __name__ == "__main__":
    main()
