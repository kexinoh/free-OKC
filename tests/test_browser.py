import threading
from http.server import SimpleHTTPRequestHandler
from socketserver import TCPServer

import pytest

from okcvm import ToolRegistry
from okcvm.tools import browser


class _QuietHandler(SimpleHTTPRequestHandler):
    """一个安静的 HTTP 请求处理器，不打印日志。"""
    def __init__(self, *args, directory: str | None = None, **kwargs):
        super().__init__(*args, directory=directory, **kwargs)

    def log_message(self, format, *args):  # noqa: A003 - signature defined by base class
        pass


@pytest.fixture
def http_site(tmp_path):
    """一个 pytest fixture，用于在后台线程中运行一个简单的 HTTP 服务器。"""
    (tmp_path / "index.html").write_text(
        """
        <html>
            <head><title>Home</title></head>
            <body>
                <h1>Welcome Home</h1>
                <a href="/about.html">About Page</a>
                <form>
                    <input type="text" name="search" placeholder="Search here">
                    <button type="button">Click Me</button>
                </form>
            </body>
        </html>
        """,
        encoding="utf-8",
    )
    (tmp_path / "about.html").write_text(
        """
        <html>
            <head><title>About</title></head>
            <body>
                <h1>About This Site</h1>
                <p>Static content for browser tool testing.</p>
                <div style="height: 1500px;"></div>
            </body>
        </html>
        """,
        encoding="utf-8",
    )

    # 使用 "localhost" 而不是 "127.0.0.1" 以确保 WebDriver 可以访问
    host = "localhost"
    server = TCPServer((host, 0), lambda *args, **kwargs: _QuietHandler(*args, directory=str(tmp_path), **kwargs))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base_url = f"http://{host}:{server.server_address[1]}"
    try:
        yield base_url
    finally:
        server.shutdown()
        thread.join()


def test_browser_visit_and_click(http_site):
    """端到端测试，覆盖访问、查找、输入、点击、状态检查和滚动功能。"""
    # 在每次测试前重置会话，确保浏览器实例是干净的
    browser.reset_session()
    registry = ToolRegistry.from_default_spec()

    # 1. 访问初始页面
    visit = registry.call("mshtools-browser_visit", url=f"{http_site}/index.html")
    assert visit.success
    assert visit.data["title"] == "Home"
    clickables = visit.data["clickable_elements"]
    
    # 查找 "About Page" 链接的索引
    about_link = next((item for item in clickables if item.get("text") == "About Page"), None)
    assert about_link is not None, "未能找到 'About Page' 链接"
    about_index = about_link["index"]

    # 2. 在页面上查找文本
    find = registry.call("mshtools-browser_find", text="Welcome")
    assert find.success
    assert find.data["matches"]
    assert find.data["matches"][0]["text"] == "Welcome Home"

    # 3. 向输入框输入文本
    input_result = registry.call("mshtools-browser_input", element_index=0, text="okcvm")
    assert input_result.success
    assert input_result.data["value"] == "okcvm"

    # 4. (验证步骤) 获取当前状态，检查输入框的值是否真的被设置了
    state_after_input = registry.call("mshtools-browser_state")
    assert state_after_input.success
    assert state_after_input.data["inputs"][0]["value"] == "okcvm"

    # 5. 点击链接导航到新页面
    click = registry.call("mshtools-browser_click", element_index=about_index)
    assert click.success
    assert "about.html" in click.data["current_url"]
    assert click.data["title"] == "About"

    # 6. 获取新页面的状态并验证
    state = registry.call("mshtools-browser_state")
    assert state.success
    assert state.data["current_url"].endswith("about.html")
    assert "About This Site" in state.data["html"]

    # 7. 向下滚动页面
    # 由于页面内容不足以滚动500px，我们添加了一个高的div来确保可以滚动
    scroll = registry.call("mshtools-browser_scroll_down", scroll_amount=500)
    assert scroll.success
    # 滚动位置可能不完全精确到500，但应该大于0
    assert scroll.data["scroll_position"] > 0
    # 在真实的浏览器环境中，如果页面高度允许，它会滚动到指定位置
    # 这里我们断言它至少滚动了
    assert scroll.data["scroll_position"] <= 500, "滚动位置不应超过请求的滚动量"

    # 8. (可选) 确保会话在测试后被清理
    browser.reset_session()
    # 验证会话是否真的被重置
    with pytest.raises(browser.ToolError, match="没有活动的浏览器会话"):
        registry.call("mshtools-browser_state")
