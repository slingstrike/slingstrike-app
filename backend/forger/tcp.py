import asyncio


async def send_tcp(host: str, port: int, data: bytes) -> int:
    """Send a TCP syslog message asynchronously. Returns bytes sent (excluding framing).

    Uses newline-delimited framing (RFC 6587 non-transparent framing).
    asyncio.open_connection keeps the event loop non-blocking.
    """
    reader, writer = await asyncio.open_connection(host, port)
    try:
        writer.write(data + b"\n")
        await writer.drain()
        return len(data)
    finally:
        writer.close()
        await writer.wait_closed()
