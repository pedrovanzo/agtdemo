import logging
from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


class TokenAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path == "/research":
            token = request.headers.get("X-Demo-Token")
            if token:
                logger.warning("[TODO] JWT token validation is disabled and needs to be reimplemented soon. Token provided: %s...", token[:20])
            else:
                logger.warning("[TODO] JWT token validation is disabled and needs to be reimplemented soon. No token provided.")

        return await call_next(request)
