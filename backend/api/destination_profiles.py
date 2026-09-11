from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models.destination_profile import DestinationProfile
from schemas.destination_profile import (
    DestinationProfileCreate,
    DestinationProfileResponse,
    DestinationProfileUpdate,
)
from schemas.pagination import Page, decode_cursor, encode_cursor

router = APIRouter(prefix="/destination-profiles", tags=["destination-profiles"])


@router.get("", response_model=Page[DestinationProfileResponse])
async def list_destination_profiles(
    cursor: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=200),
    visibility: list[str] | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> Page[DestinationProfileResponse]:
    count_stmt = select(func.count()).select_from(DestinationProfile)
    if visibility:
        count_stmt = count_stmt.where(DestinationProfile.visibility.in_(visibility))
    count_result = await db.execute(count_stmt)
    total_count: int = count_result.scalar_one()

    stmt = select(DestinationProfile).order_by(DestinationProfile.name)
    if visibility:
        stmt = stmt.where(DestinationProfile.visibility.in_(visibility))
    if cursor is not None:
        try:
            cursor_data = decode_cursor(cursor)
            cursor_name = str(cursor_data["name"])
        except (ValueError, KeyError) as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid pagination cursor",
            ) from exc
        stmt = stmt.where(DestinationProfile.name > cursor_name)
    stmt = stmt.limit(limit + 1)

    result = await db.execute(stmt)
    rows = list(result.scalars().all())

    next_cursor: str | None = None
    if len(rows) > limit:
        rows = rows[:limit]
        next_cursor = encode_cursor({"name": rows[-1].name})

    items = [DestinationProfileResponse.model_validate(r) for r in rows]
    return Page(items=items, next_cursor=next_cursor, total_count=total_count)


@router.post(
    "",
    response_model=DestinationProfileResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_destination_profile(
    payload: DestinationProfileCreate,
    db: AsyncSession = Depends(get_db),
) -> DestinationProfile:
    profile = DestinationProfile(**payload.model_dump())
    db.add(profile)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Destination profile with name '{payload.name}' already exists",
        ) from exc
    await db.refresh(profile)
    return profile


@router.get("/{profile_id}", response_model=DestinationProfileResponse)
async def get_destination_profile(
    profile_id: int,
    db: AsyncSession = Depends(get_db),
) -> DestinationProfile:
    profile = await db.get(DestinationProfile, profile_id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Destination profile not found",
        )
    return profile


@router.put("/{profile_id}", response_model=DestinationProfileResponse)
async def update_destination_profile(
    profile_id: int,
    payload: DestinationProfileUpdate,
    db: AsyncSession = Depends(get_db),
) -> DestinationProfile:
    profile = await db.get(DestinationProfile, profile_id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Destination profile not found",
        )
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(profile, field, value)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Destination profile with name '{payload.name}' already exists",
        ) from exc
    await db.refresh(profile)
    return profile


@router.delete("/{profile_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_destination_profile(
    profile_id: int,
    db: AsyncSession = Depends(get_db),
) -> None:
    profile = await db.get(DestinationProfile, profile_id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Destination profile not found",
        )
    await db.delete(profile)
    await db.commit()
