"""Minimal browser automation utilities built on HTTP fetching and parsing.

This module does not aim to fully emulate a modern browser. Instead it provides
just enough functionality for deterministic end-to-end tests and light-weight
automation workflows:

* ``browser_visit`` fetches a page over HTTP(S) and parses the DOM with
  BeautifulSoup.
* ``browser_state`` exposes the currently loaded document and the cached list of
  interactive elements.
* ``browser_click`` follows hyperlinks that were discovered via
  ``browser_visit``.
* ``browser_find`` performs simple case-insensitive text search inside the DOM.
* ``browser_input`` records values entered into form fields so that successive
  calls can introspect the simulated state.
* ``browser_scroll_up`` / ``browser_scroll_down`` adjust the virtual scroll
  offset which is reported in ``browser_state``.

The intent is to provide a predictable, dependency-light substitute for the
browser tooling described in the upstream OK Computer specification. The tools
return structured data and human-readable summaries so that higher level agents
can reason about the environment.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from .base import Tool, ToolError, ToolResult

USER_AGENT = "OKCVM/1.0 (+https://github.com/free-agent-challenge/free-OKC)"


def _build_session() -> requests.Session:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    return session


@dataclass
class ElementInfo:
    """Metadata describing a clickable element discovered on a page."""

    index: int
    tag: str
    text: str
    href: Optional[str]
    attributes: Dict[str, str]

    def serialize(self) -> Dict[str, Optional[str]]:
        data: Dict[str, Optional[str]] = {
            "index": self.index,
            "tag": self.tag,
            "text": self.text,
            "href": self.href,
        }
        if self.attributes:
            data["attributes"] = dict(self.attributes)
        return data


@dataclass
class InputInfo:
    """Metadata describing an input element that can accept text."""

    index: int
    name: Optional[str]
    input_type: str
    placeholder: Optional[str]
    value: str = ""

    def serialize(self) -> Dict[str, Optional[str]]:
        return {
            "index": self.index,
            "name": self.name,
            "type": self.input_type,
            "placeholder": self.placeholder,
            "value": self.value,
        }


@dataclass
class BrowserSession:
    """Light-weight representation of the current browser state."""

    current_url: Optional[str] = None
    title: Optional[str] = None
    html: Optional[str] = None
    scroll_position: int = 0
    clickables: List[ElementInfo] = field(default_factory=list)
    inputs: List[InputInfo] = field(default_factory=list)
    last_find_results: List[Dict[str, str]] = field(default_factory=list)

    def serialize(self) -> Dict[str, object]:
        return {
            "current_url": self.current_url,
            "title": self.title,
            "scroll_position": self.scroll_position,
            "clickable_elements": [item.serialize() for item in self.clickables],
            "inputs": [item.serialize() for item in self.inputs],
            "last_find_results": list(self.last_find_results),
        }


class BrowserSessionManager:
    """Singleton-like manager that keeps the active session in memory."""

    def __init__(self) -> None:
        self._session = BrowserSession()
        self._http = _build_session()

    def reset(self) -> None:
        self._session = BrowserSession()

    @property
    def session(self) -> BrowserSession:
        return self._session

    @property
    def http(self) -> requests.Session:
        return self._http


_manager = BrowserSessionManager()


def reset_session() -> None:
    """Reset the global browser session. Exposed for tests."""

    _manager.reset()


def _ensure_session_initialized() -> BrowserSession:
    session = _manager.session
    if session.current_url is None:
        raise ToolError("No browser session is active. Call browser_visit first.")
    return session


def _parse_page(url: str, html: str) -> BrowserSession:
    soup = BeautifulSoup(html, "html.parser")
    title = (soup.title.string or "").strip() if soup.title else None

    clickables: List[ElementInfo] = []
    for index, element in enumerate(
        soup.select("a[href], button, input[type=submit], input[type=button]")
    ):
        tag_name = element.name or "element"
        text = element.get_text(strip=True) or element.get("aria-label") or ""
        href = element.get("href")
        attrs = {key: value for key, value in element.attrs.items() if isinstance(value, str)}
        clickables.append(
            ElementInfo(index=index, tag=tag_name, text=text, href=href, attributes=attrs)
        )

    inputs: List[InputInfo] = []
    for index, element in enumerate(soup.select("input[type=text], input:not([type]), textarea")):
        input_type = element.get("type") or ("textarea" if element.name == "textarea" else "text")
        inputs.append(
            InputInfo(
                index=index,
                name=element.get("name"),
                input_type=input_type,
                placeholder=element.get("placeholder"),
            )
        )

    session = BrowserSession(
        current_url=url,
        title=title,
        html=html,
        scroll_position=0,
        clickables=clickables,
        inputs=inputs,
    )
    return session


def _navigate(url: str) -> BrowserSession:
    response = _manager.http.get(url, timeout=15)
    response.raise_for_status()
    session = _parse_page(url, response.text)
    _manager._session = session
    return session


class BrowserVisitTool(Tool):
    name = "mshtools-browser_visit"

    def call(self, **kwargs) -> ToolResult:  # type: ignore[override]
        url = kwargs.get("url")
        if not url:
            raise ToolError("'url' is required")
        if not url.startswith("http://") and not url.startswith("https://"):
            raise ToolError("Only http:// and https:// URLs are supported")

        session = _navigate(url)

        summary = f"Loaded {url}"
        if session.title:
            summary = f"Loaded {session.title} ({url})"
        return ToolResult(success=True, output=summary, data=session.serialize())


class BrowserStateTool(Tool):
    name = "mshtools-browser_state"

    def call(self, **kwargs) -> ToolResult:  # type: ignore[override]
        session = _ensure_session_initialized()
        return ToolResult(success=True, output="Current browser state", data=session.serialize())


class BrowserFindTool(Tool):
    name = "mshtools-browser_find"

    def call(self, **kwargs) -> ToolResult:  # type: ignore[override]
        term = kwargs.get("text") or kwargs.get("query")
        if not term:
            raise ToolError("'text' is required")
        session = _ensure_session_initialized()
        soup = BeautifulSoup(session.html or "", "html.parser")
        matches: List[Dict[str, str]] = []
        lower_term = term.lower()
        for element in soup.find_all(string=True):
            candidate = element.strip()
            if not candidate:
                continue
            if lower_term in candidate.lower():
                parent = element.parent
                snippet = candidate
                if len(snippet) > 240:
                    snippet = snippet[:237] + "..."
                matches.append(
                    {
                        "text": snippet,
                        "tag": parent.name if parent else "",
                    }
                )
                if len(matches) >= int(kwargs.get("limit", 20)):
                    break

        session.last_find_results = matches
        if matches:
            session.scroll_position = min(session.scroll_position + 200, 10_000)
            summary = f"Found {len(matches)} matches for '{term}'"
        else:
            summary = f"No matches for '{term}'"
        return ToolResult(success=True, output=summary, data={"matches": matches})


class BrowserClickTool(Tool):
    name = "mshtools-browser_click"

    def call(self, **kwargs) -> ToolResult:  # type: ignore[override]
        session = _ensure_session_initialized()
        index = kwargs.get("element_index")
        if index is None:
            raise ToolError("'element_index' is required")
        try:
            index_int = int(index)
        except (TypeError, ValueError) as exc:  # pragma: no cover - defensive
            raise ToolError("'element_index' must be an integer") from exc
        if not 0 <= index_int < len(session.clickables):
            raise ToolError("element_index is out of range")

        element = session.clickables[index_int]
        if element.href:
            target = urljoin(session.current_url or "", element.href)
            session = _navigate(target)
            return ToolResult(
                success=True,
                output=f"Clicked element {index_int} and navigated to {target}",
                data=session.serialize(),
            )

        summary = f"Clicked element {index_int} ({element.tag})"
        return ToolResult(success=True, output=summary, data={"element": element.serialize()})


class BrowserInputTool(Tool):
    name = "mshtools-browser_input"

    def call(self, **kwargs) -> ToolResult:  # type: ignore[override]
        session = _ensure_session_initialized()
        index = kwargs.get("element_index")
        value = kwargs.get("text") or kwargs.get("value")
        if index is None or value is None:
            raise ToolError("'element_index' and 'text' are required")
        try:
            index_int = int(index)
        except (TypeError, ValueError) as exc:
            raise ToolError("'element_index' must be an integer") from exc
        if not 0 <= index_int < len(session.inputs):
            raise ToolError("element_index is out of range")

        session.inputs[index_int].value = str(value)
        summary = f"Updated input {index_int} with provided text"
        return ToolResult(success=True, output=summary, data=session.inputs[index_int].serialize())


class BrowserScrollTool(Tool):
    """Base class shared by scroll up/down tools."""

    direction: int = 1

    def call(self, **kwargs) -> ToolResult:  # type: ignore[override]
        session = _ensure_session_initialized()
        amount = kwargs.get("scroll_amount", 400)
        try:
            amount_int = int(amount)
        except (TypeError, ValueError) as exc:  # pragma: no cover - defensive
            raise ToolError("'scroll_amount' must be an integer") from exc
        session.scroll_position = max(0, session.scroll_position + self.direction * amount_int)
        summary = f"Scrolled {'down' if self.direction > 0 else 'up'} to position {session.scroll_position}"
        return ToolResult(success=True, output=summary, data=session.serialize())


class BrowserScrollDownTool(BrowserScrollTool):
    name = "mshtools-browser_scroll_down"
    direction = 1


class BrowserScrollUpTool(BrowserScrollTool):
    name = "mshtools-browser_scroll_up"
    direction = -1


__all__ = [
    "BrowserVisitTool",
    "BrowserStateTool",
    "BrowserFindTool",
    "BrowserClickTool",
    "BrowserInputTool",
    "BrowserScrollDownTool",
    "BrowserScrollUpTool",
    "reset_session",
]

