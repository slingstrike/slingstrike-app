"""Community seeders: use cases and SIEM destination profiles.

Both seeders use per-UUID idempotency so that new files added in later releases
are picked up on upgrade without re-inserting existing records.
"""

import logging
import os
from pathlib import Path

from ruamel.yaml import YAML as _YAML
from sqlalchemy import select

_yaml = _YAML(typ="safe")
from sqlalchemy.ext.asyncio import AsyncSession

from api.olf_io import _doc_to_use_case
from core.olf_errors import OlfError
from core.olf_parser import parse_olf
from models.destination_profile import DestinationProfile
from models.object_group import ObjectGroup
from models.use_case import UseCase

logger = logging.getLogger(__name__)

# Default: <repo_root>/library/community - overridable for Docker deployments
_LIBRARY_DIR = Path(
    os.getenv("OLF_LIBRARY_DIR", str(Path(__file__).parent.parent / "library" / "community"))
)

_SIEM_PROFILES_DIR = Path(
    os.getenv(
        "OLF_SIEM_PROFILES_DIR",
        str(Path(__file__).parent.parent / "library" / "siem-profiles"),
    )
)


_OBJECTS_DIR = Path(
    os.getenv(
        "OLF_OBJECTS_DIR",
        str(Path(__file__).parent.parent / "library" / "objects"),
    )
)


async def seed_library_objects(db: AsyncSession) -> None:
    """Insert library object groups that are not yet in the database.

    Reads YAML files from library/objects/ (one file per category).
    Uses placeholder as the idempotency key so new entries added in future
    releases are inserted on upgrade without re-inserting existing records.
    """
    yaml_files = sorted(_OBJECTS_DIR.glob("*.yaml"))
    if not yaml_files:
        logger.warning("seeder: no .yaml files found in %s", _OBJECTS_DIR)
        return

    existing_placeholders: set[str] = set(
        (await db.execute(select(ObjectGroup.placeholder))).scalars()
    )

    seeded = 0
    for path in yaml_files:
        try:
            data = _yaml.load(path.read_text(encoding="utf-8"))
            category = str(data.get("category", ""))
            for spec in data.get("objects", []):
                placeholder = str(spec["placeholder"])
                if placeholder in existing_placeholders:
                    continue
                obj = ObjectGroup(
                    name=str(spec["name"]),
                    placeholder=placeholder,
                    category=category,
                    type=str(spec.get("type", "string")),
                    description=str(spec.get("description", "")),
                    values=list(spec.get("values", [])),
                )
                db.add(obj)
                seeded += 1
        except Exception as exc:
            logger.error("seeder: failed to load objects file %s: %s", path.name, exc)

    if seeded > 0:
        await db.commit()
        logger.info("seeder: inserted %d library object(s)", seeded)


async def seed_community_use_cases(db: AsyncSession) -> None:
    """Insert bundled community use cases that are not yet in the database."""
    olf_files = sorted(_LIBRARY_DIR.glob("*.olf"))
    if not olf_files:
        logger.warning("seeder: no .olf files found in %s", _LIBRARY_DIR)
        return

    seeded = 0
    for path in olf_files:
        try:
            raw = path.read_bytes()
            doc, _ = parse_olf(raw)

            existing = await db.execute(select(UseCase).where(UseCase.uuid == doc.id))
            if existing.scalar_one_or_none() is not None:
                continue

            uc = _doc_to_use_case(doc, doc.id)
            uc.imported_at = None  # bundled use cases are native, not user-imported
            db.add(uc)
            seeded += 1
        except OlfError as exc:
            logger.error("seeder: failed to parse %s: [%s] %s", path.name, exc.code, exc.message)
        except Exception as exc:
            logger.error("seeder: unexpected error loading %s: %s", path.name, exc)

    if seeded > 0:
        await db.commit()
        logger.info("seeder: inserted %d community use case(s)", seeded)


async def seed_siem_profiles(db: AsyncSession) -> None:
    """Insert bundled SIEM destination profiles that are not yet in the database."""
    yaml_files = sorted(_SIEM_PROFILES_DIR.glob("*.yaml"))
    if not yaml_files:
        logger.warning("seeder: no .yaml files found in %s", _SIEM_PROFILES_DIR)
        return

    seeded = 0
    for path in yaml_files:
        try:
            data = _yaml.load(path.read_text(encoding="utf-8"))
            profile_uuid = str(data["uuid"])

            existing = await db.execute(
                select(DestinationProfile).where(DestinationProfile.uuid == profile_uuid)
            )
            if existing.scalar_one_or_none() is not None:
                continue

            profile = DestinationProfile(
                uuid=profile_uuid,
                name=str(data["name"]),
                description=str(data.get("description", "")),
                host=str(data["host"]),
                port=int(data["port"]),
                protocol=str(data.get("protocol", "udp")),
                tls_ca_cert=data.get("tls_ca_cert"),
                visibility="public_readonly",
            )
            db.add(profile)
            seeded += 1
        except Exception as exc:
            logger.error("seeder: failed to load SIEM profile %s: %s", path.name, exc)

    if seeded > 0:
        await db.commit()
        logger.info("seeder: inserted %d SIEM profile(s)", seeded)
