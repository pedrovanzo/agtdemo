import jwt
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from collections import defaultdict
from app.config import JWT_SECRET

# In-memory use counter keyed by token jti — resets on restart
_use_counts: dict[str, int] = defaultdict(int)


def verify_token(token: str) -> tuple[bool, str]:
    """Returns (valid, error_message). Empty error means valid."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        return False, "Token expired."
    except jwt.InvalidTokenError:
        return False, "Invalid token."

    jti = payload.get("jti")
    max_uses = payload.get("max_uses")

    if not jti or max_uses is None:
        return False, "Malformed token."

    if _use_counts[jti] >= max_uses:
        return False, "Token use limit reached."

    _use_counts[jti] += 1
    return True, ""


class TokenAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path != "/research":
            return await call_next(request)

        token = request.headers.get("X-Demo-Token")
        if not token:
            return JSONResponse(status_code=401, content={"detail": "Demo token required."})

        valid, error = verify_token(token)
        if not valid:
            return JSONResponse(status_code=401, content={"detail": error})

        return await call_next(request)
