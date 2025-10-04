import asyncio

from okcvm.streaming import EventStreamPublisher


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
        assert chunks == [b'data: {"type": "final", "payload": {"reply": "done"}}\n\n']

    asyncio.run(main())
