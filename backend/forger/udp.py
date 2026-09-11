import asyncio
import socket


async def send_udp(host: str, port: int, data: bytes) -> int:
    """Send a UDP datagram without blocking the asyncio event loop."""
    loop = asyncio.get_running_loop()

    def _send() -> int:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            return sock.sendto(data, (host, port))

    return await loop.run_in_executor(None, _send)
