"""Web and image search helpers using public DuckDuckGo endpoints."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterable, List

import requests

from .base import Tool, ToolError, ToolResult

USER_AGENT = "OKCVM/1.0 (+https://github.com/free-agent-challenge/free-OKC)"


def _make_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    return session


def _normalise_query(payload: Any) -> str:
    if isinstance(payload, str):
        return payload
    if isinstance(payload, Iterable):
        return " ".join(str(item) for item in payload)
    raise ToolError("query must be a string or iterable of strings")


class WebSearchTool(Tool):
    name = "mshtools-web_search"

    def __init__(self, spec) -> None:
        super().__init__(spec)
        self._session = _make_session()

    def call(self, **kwargs) -> ToolResult:  # type: ignore[override]
        query = kwargs.get("query") or kwargs.get("queries")
        if not query:
            raise ToolError("'query' is required")
        count = int(kwargs.get("count", 5))
        query_str = _normalise_query(query)

        params = {
            "q": query_str,
            "format": "json",
            "no_html": 1,
            "no_redirect": 1,
            "skip_disambig": 1,
        }
        response = self._session.get("https://api.duckduckgo.com/", params=params, timeout=15)
        response.raise_for_status()
        payload = response.json()

        results: List[Dict[str, str]] = []

        def _extract(items: Iterable[Dict[str, Any]]) -> None:
            for item in items:
                first = item.get("FirstURL")
                text = item.get("Text")
                if first and text:
                    results.append({"title": text, "url": first})
                    if len(results) >= count:
                        return
                if "Topics" in item:
                    _extract(item["Topics"])
                if len(results) >= count:
                    return

        _extract(payload.get("RelatedTopics", []))

        if payload.get("AbstractURL") and payload.get("AbstractText"):
            results.insert(
                0,
                {
                    "title": payload.get("Heading") or payload["AbstractText"],
                    "url": payload["AbstractURL"],
                    "snippet": payload["AbstractText"],
                },
            )

        results = results[:count]
        summary = f"Found {len(results)} results for '{query_str}'"
        return ToolResult(success=True, output=summary, data={"results": results})


@dataclass
class _ImageResult:
    title: str
    image: str
    source: str

    def serialize(self) -> Dict[str, str]:
        return {"title": self.title, "image_url": self.image, "source": self.source}


class ImageSearchTool(Tool):
    name = "mshtools-image_search"

    def __init__(self, spec) -> None:
        super().__init__(spec)
        self._session = _make_session()

    def call(self, **kwargs) -> ToolResult:  # type: ignore[override]
        query = kwargs.get("query") or kwargs.get("queries")
        if not query:
            raise ToolError("'query' is required")
        count = int(kwargs.get("count", 5))
        query_str = _normalise_query(query)

        init = self._session.get("https://duckduckgo.com/", params={"q": query_str}, timeout=15)
        init.raise_for_status()

        import re

        match = re.search(r"vqd=([\d-]+)&", init.text)
        if not match:
            raise ToolError("Failed to initialise DuckDuckGo image search")
        vqd = match.group(1)

        api_url = "https://duckduckgo.com/i.js"
        response = self._session.get(
            api_url,
            params={"l": "us-en", "o": "json", "q": query_str, "vqd": vqd, "p": "1"},
            timeout=15,
        )
        response.raise_for_status()
        payload = response.json()

        results = [
            _ImageResult(
                title=item.get("title") or item.get("alt") or "Image",
                image=item.get("image"),
                source=item.get("url") or item.get("source") or "",
            )
            for item in payload.get("results", [])
            if item.get("image")
        ]

        serialised = [item.serialize() for item in results[:count]]
        summary = f"Found {len(serialised)} images for '{query_str}'"
        return ToolResult(success=True, output=summary, data={"images": serialised})


__all__ = ["WebSearchTool", "ImageSearchTool"]

