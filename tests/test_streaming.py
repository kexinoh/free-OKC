import asyncio
import json

from okcvm.streaming import EventStreamPublisher


def _decode_chunks(chunks: list[bytes]) -> list[dict[str, object]]:
    decoded: list[dict[str, object]] = []
    for chunk in chunks:
        text = chunk.decode("utf-8")
        assert text.startswith("data: ")
        payload = json.loads(text[6:].strip())
        decoded.append(payload)
    return decoded


def test_event_stream_publisher_close_without_events():
    async def main() -> None:
        loop = asyncio.get_running_loop()
        publisher = EventStreamPublisher(loop)

        async def consume() -> list[bytes]:
            chunks: list[bytes] = []
            async for chunk in publisher.iter_sse():
                chunks.append(chunk)
            return chunks

        task = asyncio.create_task(consume())
        await asyncio.sleep(0)
        publisher.close()
        result = await task
        assert result == []

    asyncio.run(main())


def test_event_stream_publisher_emits_final_event_and_terminates():
    async def main() -> None:
        loop = asyncio.get_running_loop()
        publisher = EventStreamPublisher(loop)

        async def consume() -> list[bytes]:
            collected: list[bytes] = []
            async for chunk in publisher.iter_sse():
                collected.append(chunk)
            return collected

        task = asyncio.create_task(consume())

        publisher.publish({"type": "final", "payload": {"reply": "done"}})
        await asyncio.sleep(0)
        publisher.close()

        chunks = await task
        assert _decode_chunks(chunks) == [
            {"type": "final", "payload": {"reply": "done"}}
        ]

    asyncio.run(main())


def test_event_stream_publisher_preserves_final_event_when_closed_immediately():
    async def main() -> None:
        loop = asyncio.get_running_loop()
        publisher = EventStreamPublisher(loop)

        async def consume() -> list[bytes]:
            collected: list[bytes] = []
            async for chunk in publisher.iter_sse():
                collected.append(chunk)
            return collected

        task = asyncio.create_task(consume())

        publisher.publish({"type": "final", "payload": {"reply": "done"}})
        publisher.close()

        chunks = await task
        assert _decode_chunks(chunks) == [
            {"type": "final", "payload": {"reply": "done"}}
        ]

    asyncio.run(main())


def test_event_stream_publisher_emits_stop_event():
    async def main() -> None:
        loop = asyncio.get_running_loop()
        publisher = EventStreamPublisher(loop)

        async def consume() -> list[bytes]:
            collected: list[bytes] = []
            async for chunk in publisher.iter_sse():
                collected.append(chunk)
            return collected

        task = asyncio.create_task(consume())

        publisher.publish({"type": "final", "payload": {"reply": "done"}})
        publisher.publish({"type": "stop"})
        await asyncio.sleep(0)
        publisher.close()

        chunks = await task
        assert _decode_chunks(chunks) == [
            {"type": "final", "payload": {"reply": "done"}},
            {"type": "stop"},
        ]

    asyncio.run(main())
