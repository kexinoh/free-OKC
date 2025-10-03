import json
import time
from pathlib import Path
import psutil
import requests
import pytest

from okcvm import ToolRegistry
from okcvm.tools.deployment import ManifestJSONDecoder

def kill_proc_tree(pid, sig=9, include_parent=True):
    """
    杀死一个进程及其所有子进程。
    这对于确保测试后清理干净非常重要。
    """
    try:
        parent = psutil.Process(pid)
        children = parent.children(recursive=True)
        for child in children:
            child.send_signal(sig)
        if include_parent:
            parent.send_signal(sig)
    except psutil.NoSuchProcess:
        # 如果进程已经不存在，则忽略
        pass


@pytest.fixture
def deployed_site_pid(request):
    """
    一个 Pytest fixture，用于在测试结束后自动清理服务器进程。
    它不返回任何东西，主要用于 teardown 逻辑。
    """
    pid_container = [] # 使用列表来在闭包中传递 PID
    yield pid_container # 测试将在这里运行，并可以向 pid_container 中添加 PID
    
    # --- Teardown: 测试结束后执行 ---
    if pid_container:
        print(f"\nCleaning up server process with PID: {pid_container[0]}...")
        kill_proc_tree(pid_container[0])
        print("Cleanup complete.")


def test_deploy_website_and_start_server(tmp_path, deployed_site_pid):
    """
    测试部署网站并验证服务器是否成功启动。
    """
    # --- 1. 设置测试环境 ---
    site = tmp_path / "site"
    site.mkdir()
    (site / "index.html").write_text("<html><body><h1>OKCVM</h1></body></html>", encoding="utf-8")
    (site / "styles.css").write_text("body { font-family: sans-serif; }")

    registry = ToolRegistry.from_default_spec()

    # --- 2. 调用工具 ---
    # 明确设置 start_server=True，这也是默认行为
    result = registry.call(
        "mshtools-deploy_website", 
        directory=str(site), 
        site_name="Demo", 
        force=True,
        start_server=True
    )

    # --- 3. 基本断言 ---
    assert result.success
    assert "FastAPI preview endpoint" in result.output
    
    target = Path(result.data["target"])
    assert target.exists()
    
    manifest_path = target / "deployment.json"
    assert manifest_path.exists()

    # --- 4. 验证服务器相关的清单数据 ---
    with open(manifest_path, 'r') as f:
        manifest_data = json.load(f, cls=ManifestJSONDecoder)

    assert "server_info" in manifest_data
    server_info = manifest_data["server_info"]
    assert server_info is not None
    assert "pid" in server_info and isinstance(server_info["pid"], int)
    assert "port" in server_info and isinstance(server_info["port"], int)
    assert server_info["status"] == "running"
    
    pid = server_info["pid"]
    port = server_info["port"]
    preview_url = manifest_data["preview_url"]
    assert preview_url.endswith("&path=index.html")
    server_preview_url = manifest_data.get("server_preview_url")
    assert server_preview_url is not None

    # 将 PID 传递给 fixture 以便在测试后清理
    deployed_site_pid.append(pid)

    # --- 5. 验证进程和网络服务 ---
    # 给服务器一点启动时间
    time.sleep(1) 

    # 检查进程是否存在
    assert psutil.pid_exists(pid), f"Server process with PID {pid} not found."
    
    # 检查服务器是否响应 HTTP 请求
    try:
        response = requests.get(server_preview_url, timeout=5)
        response.raise_for_status() # 如果状态码不是 2xx，则抛出异常
        assert "<h1>OKCVM</h1>" in response.text
        assert response.headers['Content-Type'].startswith('text/html')
    except requests.exceptions.RequestException as e:
        pytest.fail(f"Failed to connect to the started server at {preview_url}. Error: {e}")

def test_deploy_website_without_starting_server(tmp_path):
    """
    测试当 start_server=False 时，工具是否回退到旧的行为。
    """
    site = tmp_path / "site"
    site.mkdir()
    (site / "index.html").write_text("<html><body><h1>OKCVM</h1></body></html>", encoding="utf-8")

    registry = ToolRegistry.from_default_spec()
    
    # 明确设置 start_server=False
    result = registry.call(
        "mshtools-deploy_website", 
        directory=str(site), 
        site_name="No-Server-Demo", 
        force=True,
        start_server=False
    )

    assert result.success
    assert "FastAPI preview endpoint" in result.output

    with open(Path(result.data["target"]) / "deployment.json", 'r') as f:
        manifest_data = json.load(f, cls=ManifestJSONDecoder)

    # 验证没有服务器信息
    assert manifest_data["server_info"] is None
    assert manifest_data.get("server_preview_url") is None
    # 验证 PID 不存在（以防万一）
    assert not psutil.pid_exists(manifest_data.get("server_info", {}).get("pid", -1))


def test_deploy_website_creates_index_from_single_html(tmp_path):
    site = tmp_path / "site"
    site.mkdir()
    original = site / "hello-world.html"
    original.write_text("<html><body><h1>Hello</h1></body></html>", encoding="utf-8")

    registry = ToolRegistry.from_default_spec()

    result = registry.call(
        "mshtools-deploy_website",
        directory=str(site),
        site_name="Auto-Index",
        force=True,
        start_server=False,
    )

    assert result.success
    index_path = site / "index.html"
    assert index_path.exists()
    assert index_path.read_text(encoding="utf-8") == original.read_text(encoding="utf-8")
