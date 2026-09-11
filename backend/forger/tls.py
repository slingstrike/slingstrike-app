import asyncio
import ssl


async def send_tls(host: str, port: int, data: bytes, ca_cert: str | None = None) -> int:
    """Send a TLS syslog message asynchronously. Returns bytes sent (excluding framing).

    Uses newline-delimited framing (RFC 6587 non-transparent framing).
    Server certificate is always verified. ca_cert is a PEM string for a custom CA;
    if None the system default CA bundle is used.
    """
    if ca_cert is not None:
        ssl_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ssl_ctx.load_verify_locations(cadata=ca_cert)
    else:
        ssl_ctx = ssl.create_default_context(ssl.Purpose.SERVER_AUTH)

    reader, writer = await asyncio.open_connection(host, port, ssl=ssl_ctx)
    try:
        writer.write(data + b"\n")
        await writer.drain()
        return len(data)
    finally:
        writer.close()
        await writer.wait_closed()
