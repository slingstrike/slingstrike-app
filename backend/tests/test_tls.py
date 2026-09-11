import asyncio
import shutil
import ssl
import subprocess
import textwrap
from pathlib import Path

import pytest

from forger.tls import send_tls

pytestmark = pytest.mark.skipif(shutil.which("openssl") is None, reason="openssl CLI not available")


@pytest.fixture
def tls_certs(tmp_path: Path) -> dict[str, str]:
    """Generate a self-signed cert/key pair with IP SAN for 127.0.0.1."""
    config = tmp_path / "openssl.cnf"
    config.write_text(
        textwrap.dedent("""\
            [req]
            default_bits = 2048
            prompt = no
            default_md = sha256
            distinguished_name = dn
            x509_extensions = v3_req

            [dn]
            CN = 127.0.0.1

            [v3_req]
            subjectAltName = IP:127.0.0.1
        """)
    )
    cert = tmp_path / "cert.pem"
    key = tmp_path / "key.pem"
    subprocess.run(
        [
            "openssl",
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-keyout",
            str(key),
            "-out",
            str(cert),
            "-days",
            "1",
            "-nodes",
            "-config",
            str(config),
        ],
        check=True,
        capture_output=True,
    )
    return {"cert": str(cert), "key": str(key), "cert_pem": cert.read_text()}


async def test_send_tls_delivers_data(tls_certs: dict[str, str]) -> None:
    received: list[bytes] = []

    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        received.append(await reader.read(4096))
        writer.close()
        await writer.wait_closed()

    ssl_server_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_server_ctx.load_cert_chain(tls_certs["cert"], tls_certs["key"])

    server = await asyncio.start_server(handle, "127.0.0.1", 0, ssl=ssl_server_ctx)
    port: int = server.sockets[0].getsockname()[1]

    async with server:
        data = b"<34>Jun 23 12:00:00 web-01 sshd: auth failure"
        bytes_sent = await send_tls("127.0.0.1", port, data, ca_cert=tls_certs["cert_pem"])

    assert bytes_sent == len(data)
    assert received[0] == data + b"\n"


async def test_send_tls_returns_byte_count_without_framing(tls_certs: dict[str, str]) -> None:
    received: list[bytes] = []

    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        received.append(await reader.read(4096))
        writer.close()
        await writer.wait_closed()

    ssl_server_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_server_ctx.load_cert_chain(tls_certs["cert"], tls_certs["key"])

    server = await asyncio.start_server(handle, "127.0.0.1", 0, ssl=ssl_server_ctx)
    port: int = server.sockets[0].getsockname()[1]

    async with server:
        result = await send_tls("127.0.0.1", port, b"hello", ca_cert=tls_certs["cert_pem"])

    assert result == 5
    assert received[0] == b"hello\n"


async def test_send_tls_rejects_bad_cert(tls_certs: dict[str, str], tmp_path: Path) -> None:
    """TLS sender must refuse to connect when CA cert does not match server cert."""
    other_config = tmp_path / "other.cnf"
    other_config.write_text(
        textwrap.dedent("""\
            [req]
            default_bits = 2048
            prompt = no
            default_md = sha256
            distinguished_name = dn
            x509_extensions = v3_req

            [dn]
            CN = 127.0.0.1

            [v3_req]
            subjectAltName = IP:127.0.0.1
        """)
    )
    other_cert = tmp_path / "other_cert.pem"
    other_key = tmp_path / "other_key.pem"
    subprocess.run(
        [
            "openssl",
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-keyout",
            str(other_key),
            "-out",
            str(other_cert),
            "-days",
            "1",
            "-nodes",
            "-config",
            str(other_config),
        ],
        check=True,
        capture_output=True,
    )

    async def handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
        writer.close()
        await writer.wait_closed()

    ssl_server_ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_server_ctx.load_cert_chain(tls_certs["cert"], tls_certs["key"])

    server = await asyncio.start_server(handle, "127.0.0.1", 0, ssl=ssl_server_ctx)
    port: int = server.sockets[0].getsockname()[1]

    async with server:
        with pytest.raises(ssl.SSLCertVerificationError):
            await send_tls("127.0.0.1", port, b"hello", ca_cert=other_cert.read_text())
