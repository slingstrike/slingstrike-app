from typing import Sequence

from sqlalchemy import cast, func, select, Text
from sqlalchemy.ext.asyncio import AsyncSession

from models.object_group import ObjectGroup
from models.use_case import UseCase
from models.user_variable import UserVariable


async def count_usages(placeholder: str, db: AsyncSession) -> int:
    """Count use cases whose log_events contain this placeholder string."""
    result = await db.execute(
        select(func.count())
        .select_from(UseCase)
        .where(cast(UseCase.log_events, Text).like(f"%{placeholder}%"))
    )
    return result.scalar_one()


async def attach_usage_counts(
    rows: Sequence[ObjectGroup | UserVariable], db: AsyncSession
) -> dict[int, int]:
    """Return {row.id: usage_count} for a batch of rows exposing a `placeholder` attribute."""
    counts: dict[int, int] = {}
    for row in rows:
        counts[row.id] = await count_usages(row.placeholder, db) if row.placeholder else 0
    return counts
