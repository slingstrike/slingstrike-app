import datetime
from typing import Any

from sqlalchemy import JSON, DateTime, Integer, LargeBinary, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class UseCase(Base):
    __tablename__ = "use_cases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # OLF identity - uuid is the stable public identifier written to .olf files
    uuid: Mapped[str] = mapped_column(String(36), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    tier: Mapped[str] = mapped_column(String(20), nullable=False, default="community")
    visibility: Mapped[str] = mapped_column(String(30), nullable=False, default="private")
    created_by: Mapped[str] = mapped_column(String(255), nullable=False, default="")

    # Timestamps - last_edited_at tracks content edits; imported_at is null for native use cases
    last_edited_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    imported_at: Mapped[datetime.datetime | None] = mapped_column(DateTime, nullable=True)

    # Log source metadata (JSON: {category, platform})
    log_source: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    # Full OLF log events array - each element follows the LogEvent schema
    log_events: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)

    # AES-256-GCM encrypted template for premium tier; null for community
    template_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)

    # Classification - stored as separate JSON columns; assembled into classification{} on export
    # JSON columns - no native array type in SQLite (PRD non-negotiable)
    mitre_tactics: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    mitre_techniques: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    tags: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)

    # App-internal: destination profile IDs to send to during a session
    target_ids: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)

    # Run parameters - how many times to repeat the full event sequence and delay between runs
    run_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    run_delay_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # null until v0.4 auth; single admin user owns all records before that
    owner_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime.datetime] = mapped_column(
        DateTime, nullable=False, server_default=func.now(), onupdate=func.now()
    )
