from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException

from api import destination_profiles, health, object_groups, olf_io, send, use_cases, user_variables
from database import AsyncSessionLocal
from errors import http_exception_handler, validation_exception_handler
from seeder import seed_community_use_cases, seed_library_objects, seed_siem_profiles


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    async with AsyncSessionLocal() as db:
        await seed_community_use_cases(db)
        await seed_siem_profiles(db)
        await seed_library_objects(db)
    yield


app = FastAPI(
    title="openLogForge",
    version="0.1.0-dev",
    lifespan=lifespan,
)

app.add_exception_handler(HTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)

app.include_router(health.router, prefix="/api/v1")
app.include_router(use_cases.router, prefix="/api/v1")
app.include_router(send.router, prefix="/api/v1")
app.include_router(destination_profiles.router, prefix="/api/v1")
app.include_router(olf_io.router, prefix="/api/v1")
app.include_router(object_groups.router, prefix="/api/v1")
app.include_router(user_variables.router, prefix="/api/v1")
