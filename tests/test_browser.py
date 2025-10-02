import threading
from http.server import SimpleHTTPRequestHandler
from socketserver import TCPServer

import pytest

from okcvm import ToolRegistry
from okcvm.tools import browser


class _QuietHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, directory: str | None = None, **kwargs):
        super().__init__(*args, directory=directory, **kwargs)

    def log_message(self, format, *args):  # noqa: A003 - signature defined by base class
        pass


@pytest.fixture
def http_site(tmp_path):
    (tmp_path / "index.html").write_text(
        """
        <html>
            <head><title>Home</title></head>
            <body>
                <h1>Welcome Home</h1>
                <a href="/about.html">About Page</a>
                <form>
                    <input type="text" name="search" placeholder="Search here">
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
            </body>
        </html>
        """,
        encoding="utf-8",
    )

    handler = lambda *args, **kwargs: _QuietHandler(*args, directory=str(tmp_path), **kwargs)
    server = TCPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base_url = f"http://127.0.0.1:{server.server_address[1]}"
    try:
        yield base_url
    finally:
        server.shutdown()
        thread.join()


def test_browser_visit_and_click(http_site):
    browser.reset_session()
    registry = ToolRegistry.from_default_spec()

    visit = registry.call("mshtools-browser_visit", url=f"{http_site}/index.html")
    assert visit.success
    assert visit.data["title"] == "Home"
    clickables = visit.data["clickable_elements"]
    about_index = next(i for i, item in enumerate(clickables) if "about" in (item.get("href") or ""))

    find = registry.call("mshtools-browser_find", text="Welcome")
    assert find.success
    assert find.data["matches"]

    input_result = registry.call("mshtools-browser_input", element_index=0, text="okcvm")
    assert input_result.success
    assert input_result.data["value"] == "okcvm"

    click = registry.call("mshtools-browser_click", element_index=about_index)
    assert click.success
    assert "about.html" in click.data["current_url"]

    state = registry.call("mshtools-browser_state")
    assert state.data["current_url"].endswith("about.html")

    scroll = registry.call("mshtools-browser_scroll_down", scroll_amount=500)
    assert scroll.data["scroll_position"] >= 500
