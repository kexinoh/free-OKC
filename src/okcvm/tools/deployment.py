from __future__ import annotations

import json
import shutil
import time
from pathlib import Path
import socket
import subprocess
import sys
from contextlib import closing

from .base import Tool, ToolError, ToolResult


DEPLOY_ROOT = Path.cwd() / "deployments"


class _ManifestDict(dict):
    """Dictionary wrapper that treats ``None`` server_info as missing."""

    def get(self, key, default=None):  # type: ignore[override]
        value = super().get(key, default)
        if key == "server_info" and value is None:
            return default
        return value


def _manifest_object_hook(obj):
    if "server_info" in obj and obj.get("server_info") is None:
        return _ManifestDict(obj)
    return obj


class ManifestJSONDecoder(json.JSONDecoder):
    """JSON decoder that protects optional ``server_info`` sections."""

    def __init__(self, *args, **kwargs):
        kwargs.setdefault("object_hook", _manifest_object_hook)
        super().__init__(*args, **kwargs)


def load_manifest(path: Path) -> dict:
    """Load a deployment manifest using :class:`ManifestJSONDecoder`."""

    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle, cls=ManifestJSONDecoder)


def _slugify(name: str) -> str:
    """为名称创建一个 URL 友好的 slug。"""
    cleaned = [char.lower() if char.isalnum() else "-" for char in name]
    slug = "".join(cleaned).strip("-") or "site"
    while "--" in slug:
        slug = slug.replace("--", "-")
    return slug

def _find_free_port(start_port: int = 8000) -> int:
    """
    查找一个从 start_port 开始的可用 TCP 端口。
    """
    port = start_port
    while True:
        with closing(socket.socket(socket.AF_INET, socket.SOCK_STREAM)) as s:
            try:
                s.bind(("", port))
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                return port
            except OSError:
                # 端口已被占用，尝试下一个
                port += 1
                if port > 65535:
                    raise RuntimeError("Could not find any free port.")

def _start_http_server(directory: Path, port: int) -> subprocess.Popen:
    """
    在后台为指定目录启动一个 Python HTTP 服务器。
    返回子进程对象。
    """
    # 使用 sys.executable 确保我们用的是当前运行的 Python 解释器
    # Popen 会在后台启动进程，不会阻塞主程序
    # cwd 参数让服务器在正确的目录下运行
    process = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(port)],
        cwd=directory,
        stdout=subprocess.DEVNULL, # 将输出重定向，避免污染主程序输出
        stderr=subprocess.DEVNULL,
    )
    # 给服务器一点启动时间
    time.sleep(1)
    return process


class DeployWebsiteTool(Tool):
    name = "mshtools-deploy_website"

    def call(self, **kwargs) -> ToolResult:  # type: ignore[override]
        directory = (
            kwargs.get("directory")
            or kwargs.get("path")
            or kwargs.get("local_dir")
            or kwargs.get("source_dir")
        )
        name = kwargs.get("site_name") or kwargs.get("name")
        force = bool(kwargs.get("force", False))
        # 新增参数：控制是否自动启动服务器，默认为 True
        start_server = bool(kwargs.get("start_server", True))

        if not directory:
            raise ToolError("'directory' is required")
        source = Path(directory).expanduser().resolve()
        if not source.is_dir():
            raise ToolError(f"Directory not found: {source}")
        index = source / "index.html"
        if not index.exists():
            raise ToolError("index.html must exist in the specified directory")

        slug = _slugify(name or source.name)
        target = DEPLOY_ROOT / slug
        if target.exists():
            if not force:
                raise ToolError(
                    f"Deployment target {target} already exists. Pass force=True to overwrite."
                )
            shutil.rmtree(target)

        DEPLOY_ROOT.mkdir(parents=True, exist_ok=True)
        shutil.copytree(source, target)

        # 准备清单数据
        manifest = {
            "name": name or source.name,
            "slug": slug,
            "timestamp": int(time.time()),
            "source": str(source),
            "target": str(target),
        }

        # 如果需要，启动服务器
        if start_server:
            try:
                # 1. 避免端口冲突
                port = _find_free_port()
                # 2. 自动启动网站
                server_process = _start_http_server(DEPLOY_ROOT, port)

                preview_url = f"http://localhost:{port}/{slug}/index.html"
                manifest["preview_url"] = preview_url
                # 记录服务器信息以便管理
                manifest["server_info"] = {
                    "pid": server_process.pid,
                    "port": port,
                    "status": "running",
                }
                
                output = (
                    f"Deployment complete. Site is now being served.\n"
                    f"  PID: {server_process.pid}\n"
                    f"  Port: {port}\n"
                    f"  Preview URL: {preview_url}"
                )
            except Exception as e:
                # 如果服务器启动失败，给出错误提示，但部署本身仍然是成功的
                output = (
                    f"Deployment of files complete, but failed to start server: {e}\n"
                    f"Serve the site manually with `python -m http.server 8000` "
                    f"from {DEPLOY_ROOT} and open /{slug}/index.html"
                )
                manifest["preview_url"] = f"http://localhost:8000/{slug}/index.html" # 提供一个默认URL
                manifest["server_info"] = {
                    "pid": None,
                    "port": None,
                    "status": "error",
                }
        else:
            # 如果不启动服务器，保持原有的行为
            preview_url = f"http://localhost:8000/{slug}/index.html"
            manifest["preview_url"] = preview_url
            manifest["server_info"] = None
            output = (
                "Deployment complete. Serve the site with `python -m http.server 8000` "
                f"from {DEPLOY_ROOT} and open /{slug}/index.html"
            )

        # 写入清单文件
        (target / "deployment.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

        return ToolResult(success=True, output=output, data=manifest)


__all__ = ["DeployWebsiteTool"]
