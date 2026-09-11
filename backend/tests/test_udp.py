import asyncio
import socket

from forger.udp import send_udp


async def test_send_udp_delivers_data() -> None:
    receiver = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    receiver.bind(("127.0.0.1", 0))
    receiver.setblocking(False)
    port = receiver.getsockname()[1]
    loop = asyncio.get_running_loop()

    data = b"<34>Jun 23 12:00:00 web-01 sshd: auth failure"
    bytes_sent = await send_udp("127.0.0.1", port, data)
    received = await loop.sock_recv(receiver, 4096)
    receiver.close()

    assert bytes_sent == len(data)
    assert received == data


async def test_send_udp_returns_byte_count() -> None:
    receiver = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    receiver.bind(("127.0.0.1", 0))
    receiver.setblocking(False)
    port = receiver.getsockname()[1]
    loop = asyncio.get_running_loop()

    bytes_sent = await send_udp("127.0.0.1", port, b"hello")
    await loop.sock_recv(receiver, 4096)
    receiver.close()

    assert bytes_sent == 5


async def test_send_udp_empty_payload() -> None:
    receiver = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    receiver.bind(("127.0.0.1", 0))
    receiver.setblocking(False)
    port = receiver.getsockname()[1]
    loop = asyncio.get_running_loop()

    bytes_sent = await send_udp("127.0.0.1", port, b"")
    await loop.sock_recv(receiver, 4096)
    receiver.close()

    assert bytes_sent == 0
