import uuid as uuid_mod
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.use_case import UseCase
from schemas.pagination import Page, decode_cursor, encode_cursor
from schemas.use_case import UseCaseCreate, UseCaseResponse, UseCaseUpdate

router = APIRouter(prefix="/use-cases", tags=["use-cases"])


@router.get("", response_model=Page[UseCaseResponse])
async def list_use_cases(
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=200),
    visibility: list[str] | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> Page[UseCaseResponse]:
    count_stmt = select(func.count()).select_from(UseCase)
    if visibility:
        count_stmt = count_stmt.where(UseCase.visibility.in_(visibility))
    count_result = await db.execute(count_stmt)
    total_count: int = count_result.scalar_one()

    stmt = select(UseCase).order_by(UseCase.id.desc())
    if visibility:
        stmt = stmt.where(UseCase.visibility.in_(visibility))
    if cursor is not None:
        try:
            cursor_data = decode_cursor(cursor)
            cursor_id = int(cursor_data["id"])
        except (ValueError, KeyError) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid pagination cursor",
            ) from exc
        stmt = stmt.where(UseCase.id < cursor_id)
    stmt = stmt.limit(limit + 1)

    result = await db.execute(stmt)
    rows = list(result.scalars().all())

    next_cursor: str | None = None
    if len(rows) > limit:
        rows = rows[:limit]
        next_cursor = encode_cursor({"id": rows[-1].id})

    items = [UseCaseResponse.model_validate(r) for r in rows]
    return Page(items=items, next_cursor=next_cursor, total_count=total_count)


@router.post("", response_model=UseCaseResponse, status_code=status.HTTP_201_CREATED)
async def create_use_case(payload: UseCaseCreate, db: AsyncSession = Depends(get_db)) -> UseCase:
    data = payload.model_dump(exclude={"uuid"})
    uc_uuid = payload.uuid if payload.uuid else str(uuid_mod.uuid4())
    now = datetime.now(UTC).replace(tzinfo=None)
    uc = UseCase(**data, uuid=uc_uuid, last_edited_at=now)
    db.add(uc)
    await db.commit()
    await db.refresh(uc)
    return uc


@router.get("/{use_case_id}", response_model=UseCaseResponse)
async def get_use_case(use_case_id: int, db: AsyncSession = Depends(get_db)) -> UseCase:
    uc = await db.get(UseCase, use_case_id)
    if uc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Use case not found")
    return uc


@router.put("/{use_case_id}", response_model=UseCaseResponse)
async def update_use_case(
    use_case_id: int, payload: UseCaseUpdate, db: AsyncSession = Depends(get_db)
) -> UseCase:
    uc = await db.get(UseCase, use_case_id)
    if uc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Use case not found")
    now = datetime.now(UTC).replace(tzinfo=None)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(uc, field, value)
    uc.last_edited_at = now
    await db.commit()
    await db.refresh(uc)
    return uc


@router.delete("/{use_case_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_use_case(use_case_id: int, db: AsyncSession = Depends(get_db)) -> None:
    uc = await db.get(UseCase, use_case_id)
    if uc is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Use case not found")
    await db.delete(uc)
    await db.commit()
