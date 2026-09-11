from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from api.usage import attach_usage_counts, count_usages
from models.object_group import ObjectGroup
from schemas.object_group import ObjectGroupCreate, ObjectGroupResponse, ObjectGroupUpdate, slugify
from schemas.pagination import Page, decode_cursor, encode_cursor

router = APIRouter(prefix="/objects", tags=["objects"])


async def _unique_placeholder(base: str, db: AsyncSession, exclude_id: int | None = None) -> str:
    stmt = select(ObjectGroup.placeholder)
    if exclude_id is not None:
        stmt = stmt.where(ObjectGroup.id != exclude_id)
    existing = set((await db.execute(stmt)).scalars())
    placeholder = base
    n = 2
    while placeholder in existing:
        placeholder = f"{base}_{n}"
        n += 1
    return placeholder


@router.get("", response_model=Page[ObjectGroupResponse])
async def list_objects(
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> Page[ObjectGroupResponse]:
    total_count: int = (
        await db.execute(select(func.count()).select_from(ObjectGroup))
    ).scalar_one()

    stmt = select(ObjectGroup).order_by(ObjectGroup.name)
    if cursor is not None:
        try:
            cursor_data = decode_cursor(cursor)
            cursor_name = str(cursor_data["name"])
        except (ValueError, KeyError) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid pagination cursor",
            ) from exc
        stmt = stmt.where(ObjectGroup.name > cursor_name)
    stmt = stmt.limit(limit + 1)

    rows = list((await db.execute(stmt)).scalars())

    # Back-fill any rows that pre-date the placeholder column (migration gap)
    needs_commit = False
    for row in rows:
        if not row.placeholder:
            row.placeholder = await _unique_placeholder(slugify(row.name), db, exclude_id=row.id)
            needs_commit = True
    if needs_commit:
        await db.commit()

    next_cursor: str | None = None
    if len(rows) > limit:
        rows = rows[:limit]
        next_cursor = encode_cursor({"name": rows[-1].name})

    usage = await attach_usage_counts(rows, db)
    items = []
    for r in rows:
        resp = ObjectGroupResponse.model_validate(r)
        resp.usage_count = usage.get(r.id, 0)
        items.append(resp)

    return Page(items=items, next_cursor=next_cursor, total_count=total_count)


@router.get("/{obj_id}", response_model=ObjectGroupResponse)
async def get_object(obj_id: int, db: AsyncSession = Depends(get_db)) -> ObjectGroupResponse:
    obj = await db.get(ObjectGroup, obj_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Object not found")
    resp = ObjectGroupResponse.model_validate(obj)
    if obj.placeholder:
        resp.usage_count = await count_usages(obj.placeholder, db)
    return resp


@router.post("", response_model=ObjectGroupResponse, status_code=status.HTTP_201_CREATED)
async def create_object(
    payload: ObjectGroupCreate, db: AsyncSession = Depends(get_db)
) -> ObjectGroupResponse:
    placeholder = await _unique_placeholder(slugify(payload.name), db)
    obj = ObjectGroup(**payload.model_dump(), placeholder=placeholder)
    db.add(obj)
    try:
        await db.commit()
        await db.refresh(obj)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Object named '{payload.name}' already exists",
        ) from exc
    return ObjectGroupResponse.model_validate(obj)


@router.put("/{obj_id}", response_model=ObjectGroupResponse)
async def update_object(
    obj_id: int, payload: ObjectGroupUpdate, db: AsyncSession = Depends(get_db)
) -> ObjectGroupResponse:
    obj = await db.get(ObjectGroup, obj_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Object not found")
    name_changed = payload.name != obj.name
    for k, v in payload.model_dump().items():
        setattr(obj, k, v)
    if name_changed:
        obj.placeholder = await _unique_placeholder(slugify(payload.name), db, exclude_id=obj_id)
    try:
        await db.commit()
        await db.refresh(obj)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Object named '{payload.name}' already exists",
        ) from exc
    return ObjectGroupResponse.model_validate(obj)


@router.delete("/{obj_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_object(obj_id: int, db: AsyncSession = Depends(get_db)) -> None:
    obj = await db.get(ObjectGroup, obj_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Object not found")
    await db.delete(obj)
    await db.commit()
