import asyncio

from forger.tcp import send_tcp


async def test_send_tcp_delivers_data() -> None:
    received: list[bytes] = []

    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        data = await reader.read(4096)
        received.append(data)
        writer.close()
        await writer.wait_closed()

    server = await asyncio.start_server(handle, "127.0.0.1", 0)
    port: int = server.sockets[0].getsockname()[1]

    async with server:
        data = b"<34>Jun 23 12:00:00 web-01 sshd: auth failure"
        bytes_sent = await send_tcp("127.0.0.1", port, data)

    assert bytes_sent == len(data)
    assert received[0] == data + b"\n"


async def test_send_tcp_returns_byte_count_without_framing() -> None:
    received: list[bytes] = []

    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        received.append(await reader.read(4096))
        writer.close()
        await writer.wait_closed()

    server = await asyncio.start_server(handle, "127.0.0.1", 0)
    port: int = server.sockets[0].getsockname()[1]

    async with server:
        result = await send_tcp("127.0.0.1", port, b"hello")

    assert result == 5
    assert received[0] == b"hello\n"


async def test_send_tcp_empty_payload() -> None:
    received: list[bytes] = []

    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        received.append(await reader.read(4096))
        writer.close()
        await writer.wait_closed()

    server = await asyncio.start_server(handle, "127.0.0.1", 0)
    port: int = server.sockets[0].getsockname()[1]

    async with server:
        result = await send_tcp("127.0.0.1", port, b"")

    assert result == 0
    assert received[0] == b"\n"
