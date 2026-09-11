import asyncio
import ipaddress
import random
import re
import secrets
import uuid as uuid_mod
from datetime import UTC, datetime, timedelta
from typing import Any

_JINJA_VAR_RE = re.compile(r"\{\{[\s]*(\w+)[\s]*\}\}")

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from forger.renderer import TemplateValidationError, render_template, validate_template
from forger.tcp import send_tcp
from forger.tls import send_tls
from forger.udp import send_udp
from models.destination_profile import DestinationProfile
from models.object_group import ObjectGroup
from models.use_case import UseCase
from schemas.send import SendRequest, SendResponse

router = APIRouter(tags=["forger"])

# In-process registry of active sends, keyed by use_case_id, so a send can be
# cancelled mid-flight from a separate request. Single-worker assumption.
_active_sends: dict[int, asyncio.Event] = {}


async def _interruptible_sleep(seconds: float, cancel_event: asyncio.Event) -> bool:
    """Sleep for the given duration, waking early if cancelled. Returns True if cancelled."""
    try:
        await asyncio.wait_for(cancel_event.wait(), timeout=seconds)
        return True
    except TimeoutError:
        return False


def _template_lines(template_str: str) -> list[str]:
    """Split a multi-line template into individual messages, one per content line.

    Analysts can paste a sequence of related log lines into a single event instead
    of creating one "Add Event" block per line; each line is sent as its own message.
    Blank lines are dropped. Lines starting with '#' (after leading whitespace) are
    treated as comments and dropped too - handy for notes or disabling a line without
    deleting it.
    A single-line (or blank/comment-only) template is returned unchanged as a
    one-element list, preserving legacy behaviour of always sending something for a
    genuinely blank template.
    """
    lines = [
        ln for ln in template_str.splitlines() if ln.strip() and not ln.strip().startswith("#")
    ]
    if lines:
        return lines
    return [] if template_str.strip() else [template_str]


def _random_ipv4(spec: dict[str, Any]) -> str:
    cidr: str | None = spec.get("cidr")
    range_str: str | None = spec.get("range")
    if cidr:
        net = ipaddress.ip_network(cidr, strict=False)
        hosts = list(net.hosts())
        return str(random.choice(hosts)) if hosts else str(net.network_address)
    if range_str and "-" in range_str:
        start_s, end_s = range_str.split("-", 1)
        start = int(ipaddress.ip_address(start_s.strip()))
        end = int(ipaddress.ip_address(end_s.strip()))
        return str(ipaddress.ip_address(random.randint(min(start, end), max(start, end))))
    return ".".join(str(random.randint(0, 255)) for _ in range(4))


def _random_ipv6() -> str:
    return str(ipaddress.IPv6Address(random.getrandbits(128)))


def _resolve_var(spec: Any, objects: dict[str, list[str]] | None = None) -> str:
    """Resolve a single variable spec to its string value."""
    if not isinstance(spec, dict):
        return str(spec) if spec is not None else ""

    var_type: str = str(spec.get("type", "string"))
    source: str = str(spec.get("source", ""))
    default: Any = spec.get("default")

    if source == "generated":
        if var_type == "timestamp":
            fmt = str(spec.get("format", "rfc5424"))
            offset = int(spec.get("offset_seconds", 0))
            now = datetime.now(UTC) + timedelta(seconds=offset)
            if fmt == "rfc3164":
                return f"{now.strftime('%b')} {now.day:2d} {now.strftime('%H:%M:%S')}"
            return now.isoformat()
        if var_type == "uuid":
            return str(uuid_mod.uuid4())
        if var_type == "integer":
            lo = int(spec.get("min", default if default is not None else 1000))
            hi = int(spec.get("max", default if default is not None else 9999))
            return str(random.randint(min(lo, hi), max(lo, hi)))
        if var_type in ("ipv4", "ip"):
            return _random_ipv4(spec)
        if var_type == "ipv6":
            return _random_ipv6()
        if var_type == "port":
            lo = int(spec.get("min", 1024))
            hi = int(spec.get("max", 65535))
            return str(random.randint(min(lo, hi), max(lo, hi)))
        if var_type == "mac_address":
            octets = [random.randint(0, 255) for _ in range(6)]
            octets[0] = (octets[0] & 0xFE) | 0x02  # locally administered unicast
            return ":".join(f"{o:02x}" for o in octets)
        if var_type == "username":
            _INITIALS = list("abcdjklmnprst")
            _SURNAMES = ["smith", "jones", "brown", "taylor", "wilson", "davis",
                         "miller", "moore", "martin", "white", "anderson", "thomas",
                         "jackson", "harris", "robinson"]
            return random.choice(_INITIALS) + random.choice(_SURNAMES)
        if var_type == "hostname":
            _PREFIXES = ["ws", "srv", "dc", "app", "web", "db", "file",
                         "mail", "proxy", "vpn", "adm", "jump"]
            return f"{random.choice(_PREFIXES)}-{random.randint(1, 99):02d}"
        if var_type == "hash":
            algorithm = str(spec.get("algorithm", "sha256"))
            if algorithm == "md5":
                return secrets.token_hex(16)
            if algorithm == "sha1":
                return secrets.token_hex(20)
            return secrets.token_hex(32)
        if var_type == "enum":
            values = spec.get("values") or []
            if values:
                return str(random.choice(values))

    if source in ("object", "group"):
        obj_name = str(spec.get("object", "") or spec.get("group", ""))
        if objects and obj_name in objects:
            vals = objects[obj_name]
            if vals:
                return random.choice(vals)

    return str(default) if default is not None else ""


def _build_variables(
    event: dict[str, Any],
    overrides: dict[str, str],
    objects: dict[str, list[str]] | None = None,
) -> dict[str, str]:
    """Merge declared variable defaults with caller-supplied overrides."""
    declared: dict[str, Any] = event.get("variables") or {}
    defaults = {name: _resolve_var(spec, objects) for name, spec in declared.items()}
    return {**defaults, **overrides}


async def _load_objects(
    event: dict[str, Any], template: str, db: AsyncSession
) -> dict[str, list[str]]:
    """Load object groups referenced either by source=object variables or directly in the template.

    Returns two-key dicts merged: {obj.name: values} for source=object lookups
    and {obj.placeholder: values} for direct template placeholder injection.
    """
    declared: dict[str, Any] = event.get("variables") or {}

    # Names referenced via source=object variable spec
    by_name = {
        str(spec.get("object", "") or spec.get("group", ""))
        for spec in declared.values()
        if isinstance(spec, dict)
        and spec.get("source") in ("object", "group")
        and (spec.get("object") or spec.get("group"))
    }

    # Placeholders used directly in the template (e.g. {{ corp_workstations }})
    template_vars = set(_JINJA_VAR_RE.findall(template))

    if not by_name and not template_vars:
        return {}

    stmt = select(ObjectGroup)
    if by_name and template_vars:
        stmt = stmt.where(
            (ObjectGroup.name.in_(by_name)) | (ObjectGroup.placeholder.in_(template_vars))
        )
    elif by_name:
        stmt = stmt.where(ObjectGroup.name.in_(by_name))
    else:
        stmt = stmt.where(ObjectGroup.placeholder.in_(template_vars))

    rows = list((await db.execute(stmt)).scalars())
    result: dict[str, list[str]] = {}
    for row in rows:
        if row.type == "timestamp":
            fmt = (list(row.values or []) + ["rfc5424"])[0]
            now = datetime.now(UTC)
            if fmt == "rfc3164":
                ts = f"{now.strftime('%b')} {now.day:2d} {now.strftime('%H:%M:%S')}"
            else:
                ts = now.isoformat()
            vals = [ts]
        else:
            vals = list(row.values or [])
        result[row.name] = vals
        result[row.placeholder] = vals
    return result


async def _dispatch(
    protocol: str, host: str, port: int, data: bytes, tls_ca_cert: str | None = None
) -> int:
    if protocol == "tcp":
        return await send_tcp(host, port, data)
    if protocol == "tls":
        return await send_tls(host, port, data, ca_cert=tls_ca_cert)
    return await send_udp(host, port, data)


@router.post(
    "/use-cases/{use_case_id}/send",
    response_model=SendResponse,
    status_code=status.HTTP_200_OK,
)
async def send_use_case(
    use_case_id: int,
    payload: SendRequest,
    db: AsyncSession = Depends(get_db),
) -> SendResponse:
    uc: UseCase | None = await db.get(UseCase, use_case_id)
    if uc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Use case not found")

    if not uc.log_events:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Use case has no log events",
        )

    if payload.destination_id is not None:
        profile: DestinationProfile | None = await db.get(
            DestinationProfile, payload.destination_id
        )
        if profile is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Destination profile not found",
            )
        host = profile.host
        port = profile.port
        protocol = profile.protocol
        tls_ca_cert = profile.tls_ca_cert
    else:
        host = payload.host or ""
        port = payload.port or 0
        protocol = "udp"
        tls_ca_cert = None

    # Validate all event templates up front before sending anything
    for event in uc.log_events:
        try:
            validate_template(event.get("template", ""))
        except TemplateValidationError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Invalid template in event {event.get('sequence', '?')}: {exc}",
            ) from exc

    # Every placeholder must resolve to something before sending anything. The
    # editor's live preview only shows a value for placeholders it can
    # resolve (declared variable or a matching Object) - a use case that
    # renders fine there must not silently send blanks for a placeholder that
    # lost its declaration (e.g. edited via direct API access, bypassing the
    # editor's own resolution logic). Fail closed, not fail silent-blank.
    for event in uc.log_events:
        template_str = event.get("template", "")
        declared = set((event.get("variables") or {}).keys())
        referenced = set(_JINJA_VAR_RE.findall(template_str))
        objects = await _load_objects(event, template_str, db)
        unresolved = referenced - declared - set(objects.keys()) - set(payload.variables.keys())
        if unresolved:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Event {event.get('sequence', '?')} references placeholder(s) with "
                    f"no matching variable or object, so they would render blank: "
                    f"{sorted(unresolved)}"
                ),
            )

    run_count: int = max(1, uc.run_count or 1)
    run_delay_ms: int = max(1, uc.run_delay_ms or 1)
    total_bytes = 0
    cancelled = False

    cancel_event = asyncio.Event()
    _active_sends[use_case_id] = cancel_event
    try:
        for run_idx in range(run_count):
            if cancelled:
                break
            for event_idx, event in enumerate(uc.log_events):
                if cancelled:
                    break
                repeat_raw = event.get("repeat")
                repeat: int = 1 if repeat_raw is None else int(repeat_raw)
                if repeat <= 0:
                    # repeat: 0 skips this log block entirely - delay_ms does not fire.
                    continue

                template_str = event.get("template", "")
                delay_ms: int = int(event.get("delay_ms") or 0)

                objects = await _load_objects(event, template_str, db)
                lines = _template_lines(template_str)

                for rep_idx in range(repeat):
                    if cancel_event.is_set():
                        cancelled = True
                        break

                    for line_idx, line in enumerate(lines):
                        if cancel_event.is_set():
                            cancelled = True
                            break
                        variables = _build_variables(event, payload.variables, objects)
                        for placeholder, vals in objects.items():
                            if placeholder not in variables and vals:
                                variables[placeholder] = random.choice(vals)

                        rendered = render_template(line, variables)
                        data = rendered.encode("utf-8")
                        total_bytes += await _dispatch(
                            protocol, host, port, data, tls_ca_cert=tls_ca_cert
                        )
                        # Delay between individual lines of the same event (not after the last one)
                        if line_idx < len(lines) - 1 and delay_ms > 0:
                            cancelled = await _interruptible_sleep(delay_ms / 1000, cancel_event)
                            if cancelled:
                                break

                    if cancelled:
                        break

                    # Delay between repetitions of the full line set (not after the last one)
                    if rep_idx < repeat - 1 and delay_ms > 0:
                        cancelled = await _interruptible_sleep(delay_ms / 1000, cancel_event)
                        if cancelled:
                            break

                if cancelled:
                    break

                # Delay between events in the sequence (not after the last event)
                if event_idx < len(uc.log_events) - 1 and delay_ms > 0:
                    cancelled = await _interruptible_sleep(delay_ms / 1000, cancel_event)

            if cancelled:
                break

            # Delay between runs (not after the last run)
            if run_idx < run_count - 1 and run_delay_ms > 0:
                cancelled = await _interruptible_sleep(run_delay_ms / 1000, cancel_event)
    finally:
        _active_sends.pop(use_case_id, None)

    return SendResponse(
        bytes_sent=total_bytes,
        destination=f"{host}:{port}",
        cancelled=cancelled,
    )


@router.post(
    "/use-cases/{use_case_id}/send/cancel",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def cancel_use_case_send(use_case_id: int) -> None:
    cancel_event = _active_sends.get(use_case_id)
    if cancel_event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active send for this use case",
        )
    cancel_event.set()
