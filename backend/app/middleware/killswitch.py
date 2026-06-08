from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from app.config import APP_KILLSWITCH


class KillswitchMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if APP_KILLSWITCH:
            return JSONResponse(
                status_code=503,
                content={"detail": "Service temporarily unavailable."},
            )
        return await call_next(request)
