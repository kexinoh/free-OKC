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
OUTPUT_DIR = BACKEND_BUNDLE_DIR / "dist"


def get_current_platform():
    """获取当前平台标识"""
    return platform.system().lower()


def get_exe_extension():
    """获取可执行文件扩展名"""
    if platform.system() == "Windows":
        return ".exe"
    return ""


def get_exe_name():
    """获取可执行文件名"""
    ext = get_exe_extension()
    return f"okcvm-server{ext}"


def run_pyinstaller():
    """运行 PyInstaller 打包"""
    print("[INFO] Running PyInstaller...")
    
    # 确保输出目录存在
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    
    # PyInstaller 参数
    entry_point = SRC_DIR / "okcvm" / "server.py"
    exe_name = get_exe_name().replace(get_exe_extension(), "")
    
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
        "okcvm.api.models",
        "okcvm.tools",
        "okcvm.tools.shell",
        "okcvm.tools.files",
        "okcvm.tools.browser",
        "okcvm.tools.deployment",
        "okcvm.tools.slides",
        "okcvm.tools.search",
        "okcvm.tools.media",
        "okcvm.tools.todo",
        "okcvm.tools.ipython",
        "okcvm.tools.data_sources",
        "okcvm.storage",
        "okcvm.storage.conversations",
        "uvicorn.logging",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.http.h11_impl",
        "uvicorn.protocols.http.httptools_impl",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.protocols.websockets.websockets_impl",
        "uvicorn.protocols.websockets.wsproto_impl",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "uvicorn.lifespan.off",
        "sqlalchemy.dialects.sqlite",
        "langchain",
        "langchain_openai",
        "langchain_core",
        "engineio.async_drivers.threading",
        "httptools",
        "websockets",
        "watchfiles",
        "httpx",
        "anyio",
        "yaml",
        "dotenv",
        "multipart",
        "python_multipart",
    ]
    
    # 构建命令
    cmd = [
        sys.executable, "-m", "PyInstaller",
        "--name", exe_name,
        "--onefile",  # 单文件模式
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
    
    # 添加运行时钩子
    runtime_hook = BACKEND_BUNDLE_DIR / "runtime-hooks" / "pyi_rth_okcvm.py"
    if runtime_hook.exists():
        cmd.extend(["--runtime-hook", str(runtime_hook)])
    
    # 添加入口点
    cmd.append(str(entry_point))
    
    print(f"[INFO] Command: {' '.join(cmd)}")
    
    # 执行
    env = os.environ.copy()
    env["PYTHONPATH"] = str(SRC_DIR) + os.pathsep + env.get("PYTHONPATH", "")
    
    result = subprocess.run(cmd, cwd=WORKSPACE_ROOT, env=env)
    
    if result.returncode != 0:
        print("[ERROR] PyInstaller failed")
        sys.exit(1)
    
    print("[SUCCESS] PyInstaller completed")


def clean_build():
    """清理构建产物"""
    print("[INFO] Cleaning build artifacts...")
    
    build_dir = PROJECT_ROOT / "build"
    if build_dir.exists():
        shutil.rmtree(build_dir)
    
    # 清理输出目录
    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    
    # 清理 PyInstaller 临时文件
    for pattern in ["*.log"]:
        for f in BACKEND_BUNDLE_DIR.glob(pattern):
            f.unlink()


def main():
    parser = argparse.ArgumentParser(description="Bundle OKCVM Python backend")
    parser.add_argument(
        "--clean",
        action="store_true",
        help="Clean build artifacts before building",
    )
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="Skip build (for testing)",
    )
    
    args = parser.parse_args()
    
    print("=" * 60)
    print("OKCVM Backend Bundler (Electron)")
    print("=" * 60)
    print(f"Platform: {platform.system()} {platform.machine()}")
    print(f"Output: {OUTPUT_DIR}")
    print("=" * 60)
    
    if args.clean:
        clean_build()
    
    if args.skip_build:
        print("[INFO] Skipping build")
        return
    
    # 运行打包
    run_pyinstaller()
    
    # 验证输出
    exe_name = get_exe_name()
    exe_path = OUTPUT_DIR / exe_name
    
    if exe_path.exists():
        size = exe_path.stat().st_size / (1024 * 1024)
        print(f"\n[SUCCESS] Bundle created: {exe_path} ({size:.1f} MB)")
    else:
        # 检查是否生成了文件
        for f in OUTPUT_DIR.iterdir():
            if f.is_file() and "okcvm" in f.name.lower():
                size = f.stat().st_size / (1024 * 1024)
                print(f"\n[SUCCESS] Bundle created: {f} ({size:.1f} MB)")
                # 重命名为标准名称
                if f.name != exe_name:
                    shutil.move(f, exe_path)
                break
        else:
            print(f"\n[ERROR] Bundle not found at expected location")
            print(f"Contents of {OUTPUT_DIR}:")
            if OUTPUT_DIR.exists():
                for f in OUTPUT_DIR.iterdir():
                    print(f"  - {f.name}")
            sys.exit(1)


if __name__ == "__main__":
    main()
