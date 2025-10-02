from okcvm import ToolRegistry
from okcvm.tools import search


class _JsonResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _TextResponse:
    def __init__(self, text):
        self.text = text

    def raise_for_status(self):
        return None


class _DummySession:
    def get(self, url, params=None, timeout=None):
        if "api.duckduckgo.com" in url:
            return _JsonResponse(
                {
                    "RelatedTopics": [
                        {"FirstURL": "https://example.com", "Text": "Example Result"}
                    ]
                }
            )
        if url.endswith("/i.js"):
            return _JsonResponse(
                {
                    "results": [
                        {"image": "https://img.example.com/a.png", "title": "Image A", "url": "https://example.com/a"}
                    ]
                }
            )
        return _TextResponse("vqd=12345&")


def test_search_tools(monkeypatch):
    monkeypatch.setattr(search, "_make_session", lambda: _DummySession())
    registry = ToolRegistry.from_default_spec()

    web = registry.call("mshtools-web_search", query="okcvm")
    assert web.success
    assert web.data["results"][0]["url"] == "https://example.com"

    images = registry.call("mshtools-image_search", query="okcvm")
    assert images.success
    assert images.data["images"][0]["image_url"].startswith("https://img.example.com")
