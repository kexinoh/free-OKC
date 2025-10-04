from __future__ import annotations

import asyncio
import json
import time
from typing import Any, AsyncIterator, Callable, Dict, Optional
from uuid import UUID

from langchain_core.callbacks.base import BaseCallbackHandler


def _normalise_text(value: Any) -> Optional[str]:
    """Return a readable string representation for tool payloads."""

    if value is None:
        return None
    if isinstance(value, str):
        text = value.strip()
        return text or None
    try:
        return json.dumps(value, ensure_ascii=False)
    except (TypeError, ValueError):
        text = str(value)
        return text.strip() or None


def _truncate(text: str, limit: int = 320) -> str:
    if len(text) <= limit:
        return text
    return f"{text[: limit - 1]}…"


class EventStreamPublisher:
    """Thread-safe helper that serialises events into SSE payloads."""

    def __init__(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop
        self._queue: asyncio.Queue[Dict[str, Any] | None] = asyncio.Queue()
        self._closed = False

    def publish(self, event: Dict[str, Any]) -> None:
        """Schedule *event* to be emitted to connected clients."""

        if self._closed:
            return

        def _enqueue() -> None:
            if not self._closed:
                self._queue.put_nowait(event)

        self._loop.call_soon_threadsafe(_enqueue)

    def close(self) -> None:
        if self._closed:
            return
        self._closed = True

        def _finalise() -> None:
            self._queue.put_nowait(None)

        self._loop.call_soon_threadsafe(_finalise)

    async def iter_sse(self) -> AsyncIterator[bytes]:
        """Yield server-sent event payloads until a terminal message is sent."""

        try:
            while True:
                event = await self._queue.get()
                if event is None:
                    break
                payload = json.dumps(event, ensure_ascii=False)
                yield f"data: {payload}\n\n".encode("utf-8")
                if event.get("type") in {"final", "error"}:
                    break
        finally:
            self._closed = True


class LangChainStreamingHandler(BaseCallbackHandler):
    """Relay LangChain runtime events to the front-end via SSE."""

    def __init__(self, publish: Callable[[Dict[str, Any]], None]) -> None:
        super().__init__()
        self._publish = publish
        self._tool_start_times: Dict[UUID, float] = {}
        self._tool_names: Dict[UUID, str] = {}

    def on_llm_new_token(self, token: str, **kwargs: Any) -> None:  # noqa: ANN401
        if token:
            self._publish({"type": "token", "delta": token})

    def on_tool_start(
        self,
        serialized: Dict[str, Any],  # noqa: ANN401
        input_str: str,
        run_id: UUID,
        **kwargs: Any,  # noqa: ANN401
    ) -> None:
        name = None
        if isinstance(serialized, dict):
            name = serialized.get("name") or serialized.get("id")
        details = _normalise_text(input_str)
        event: Dict[str, Any] = {
            "type": "tool_started",
            "invocation_id": str(run_id),
        }
        if name:
            event["tool_name"] = name
            self._tool_names[run_id] = name
        if details:
            event["input"] = _truncate(details)
        self._tool_start_times[run_id] = time.perf_counter()
        self._publish(event)

    def on_tool_end(
        self,
        output: Any,
        run_id: UUID,
        **kwargs: Any,  # noqa: ANN401
    ) -> None:
        preview = _normalise_text(output)
        elapsed_ms = None
        started = self._tool_start_times.pop(run_id, None)
        if started is not None:
            elapsed_ms = (time.perf_counter() - started) * 1000
        tool_name = self._tool_names.pop(run_id, None)
        event: Dict[str, Any] = {
            "type": "tool_completed",
            "invocation_id": str(run_id),
            "status": "success",
        }
        if tool_name:
            event["tool_name"] = tool_name
        if elapsed_ms is not None:
            event["duration_ms"] = round(elapsed_ms, 2)
        if preview:
            event["output"] = _truncate(preview)
        self._publish(event)

    def on_tool_error(
        self,
        error: Exception,
        run_id: UUID,
        **kwargs: Any,  # noqa: ANN401
    ) -> None:
        started = self._tool_start_times.pop(run_id, None)
        elapsed_ms = None
        if started is not None:
            elapsed_ms = (time.perf_counter() - started) * 1000
        message = str(error).strip() or "Tool execution failed"
        tool_name = self._tool_names.pop(run_id, None)
        event: Dict[str, Any] = {
            "type": "tool_completed",
            "invocation_id": str(run_id),
            "status": "error",
            "error": message,
        }
        if tool_name:
            event["tool_name"] = tool_name
        if elapsed_ms is not None:
            event["duration_ms"] = round(elapsed_ms, 2)
        self._publish(event)


__all__ = ["EventStreamPublisher", "LangChainStreamingHandler"]
