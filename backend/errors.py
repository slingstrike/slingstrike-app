import json as _json
from typing import Any

from fastapi import Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

_STATUS_CODES: dict[int, str] = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "UNPROCESSABLE_ENTITY",
    429: "TOO_MANY_REQUESTS",
    500: "INTERNAL_SERVER_ERROR",
}


def _error_body(code: str, message: str, details: dict[str, Any]) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "details": details}}


async def http_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, HTTPException):
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_error_body("INTERNAL_SERVER_ERROR", "An unexpected error occurred", {}),
        )
    code = _STATUS_CODES.get(exc.status_code, "HTTP_ERROR")
    message = str(exc.detail) if exc.detail is not None else "An error occurred"
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_body(code, message, {}),
    )


async def validation_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    raw: list[Any] = list(exc.errors()) if isinstance(exc, RequestValidationError) else []
    # ctx fields may contain Exception objects; round-trip through json to make serializable
    errors: list[Any] = _json.loads(_json.dumps(raw, default=str))
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=_error_body(
            "VALIDATION_ERROR",
            "Request validation failed",
            {"errors": errors},
        ),
    )
