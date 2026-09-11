from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from api.usage import attach_usage_counts, count_usages
from models.user_variable import UserVariable
from schemas.pagination import Page, decode_cursor, encode_cursor
from schemas.user_variable import (
    UserVariableCreate,
    UserVariableResponse,
    UserVariableUpdate,
    slugify_var,
)

router = APIRouter(prefix="/variables", tags=["variables"])


async def _unique_placeholder(base: str, db: AsyncSession, exclude_id: int | None = None) -> str:
    stmt = select(UserVariable.placeholder)
    if exclude_id is not None:
        stmt = stmt.where(UserVariable.id != exclude_id)
    existing = set((await db.execute(stmt)).scalars())
    placeholder = base
    n = 2
    while placeholder in existing:
        placeholder = f"{base}_{n}"
        n += 1
    return placeholder


@router.get("", response_model=Page[UserVariableResponse])
async def list_user_variables(
    cursor: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
) -> Page[UserVariableResponse]:
    total_count: int = (
        await db.execute(select(func.count()).select_from(UserVariable))
    ).scalar_one()

    stmt = select(UserVariable).order_by(UserVariable.name)
    if cursor is not None:
        try:
            cursor_data = decode_cursor(cursor)
            cursor_name = str(cursor_data["name"])
        except (ValueError, KeyError) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid pagination cursor",
            ) from exc
        stmt = stmt.where(UserVariable.name > cursor_name)
    stmt = stmt.limit(limit + 1)

    rows = list((await db.execute(stmt)).scalars())
    next_cursor: str | None = None
    if len(rows) > limit:
        rows = rows[:limit]
        next_cursor = encode_cursor({"name": rows[-1].name})

    usage = await attach_usage_counts(rows, db)
    items = []
    for r in rows:
        resp = UserVariableResponse.model_validate(r)
        resp.usage_count = usage.get(r.id, 0)
        items.append(resp)

    return Page(items=items, next_cursor=next_cursor, total_count=total_count)


@router.get("/{var_id}", response_model=UserVariableResponse)
async def get_user_variable(var_id: int, db: AsyncSession = Depends(get_db)) -> UserVariableResponse:
    var = await db.get(UserVariable, var_id)
    if var is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variable not found")
    resp = UserVariableResponse.model_validate(var)
    resp.usage_count = await count_usages(var.placeholder, db)
    return resp


@router.post("", response_model=UserVariableResponse, status_code=status.HTTP_201_CREATED)
async def create_user_variable(
    payload: UserVariableCreate, db: AsyncSession = Depends(get_db)
) -> UserVariableResponse:
    placeholder = await _unique_placeholder(slugify_var(payload.name), db)
    var = UserVariable(**payload.model_dump(), placeholder=placeholder)
    db.add(var)
    try:
        await db.commit()
        await db.refresh(var)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Variable named '{payload.name}' already exists",
        ) from exc
    return UserVariableResponse.model_validate(var)


@router.put("/{var_id}", response_model=UserVariableResponse)
async def update_user_variable(
    var_id: int, payload: UserVariableUpdate, db: AsyncSession = Depends(get_db)
) -> UserVariableResponse:
    var = await db.get(UserVariable, var_id)
    if var is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variable not found")
    name_changed = payload.name != var.name
    new_placeholder = (
        await _unique_placeholder(slugify_var(payload.name), db, exclude_id=var_id)
        if name_changed
        else var.placeholder
    )
    for k, v in payload.model_dump().items():
        setattr(var, k, v)
    var.placeholder = new_placeholder
    try:
        await db.commit()
        await db.refresh(var)
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Variable named '{payload.name}' already exists",
        ) from exc
    return UserVariableResponse.model_validate(var)


@router.delete("/{var_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_variable(var_id: int, db: AsyncSession = Depends(get_db)) -> None:
    var = await db.get(UserVariable, var_id)
    if var is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variable not found")
    await db.delete(var)
    await db.commit()
