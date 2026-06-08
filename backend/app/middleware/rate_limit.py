from datetime import date
from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from collections import defaultdict
from app.config import RATE_LIMIT_PER_HOUR, DAILY_REQUEST_CAP
import time

# In-memory stores — reset on restart, acceptable for demo
_ip_window: dict[str, list[float]] = defaultdict(list)
_daily: dict[str, int] = {}  # keyed by ISO date string


class RateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        # Only gate the research endpoint
        if request.url.path != "/research":
            return await call_next(request)

        today = date.today().isoformat()
        daily_count = _daily.get(today, 0)
        if daily_count >= DAILY_REQUEST_CAP:
            return JSONResponse(
                status_code=429,
                content={"detail": "Daily request limit reached. Try again tomorrow."},
            )

        ip = request.client.host
        now = time.time()
        window = [t for t in _ip_window[ip] if now - t < 3600]
        if len(window) >= RATE_LIMIT_PER_HOUR:
            return JSONResponse(
                status_code=429,
                content={"detail": f"Rate limit: {RATE_LIMIT_PER_HOUR} requests per hour per IP."},
            )

        _ip_window[ip] = window + [now]
        _daily[today] = daily_count + 1

        return await call_next(request)
