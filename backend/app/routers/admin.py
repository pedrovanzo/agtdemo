import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Request, HTTPException, Query
import jwt
from app.config import JWT_SECRET

router = APIRouter(prefix="/admin", tags=["admin"])


def _require_localhost(request: Request):
    host = request.client.host
    if host not in ("127.0.0.1", "::1", "localhost"):
        raise HTTPException(status_code=403, detail="Admin endpoints are localhost-only.")


@router.get("/generate-token")
def generate_token(
    request: Request,
    label: str = Query(..., description="Recipient identifier, e.g. linkedin handle"),
    uses: int = Query(10, ge=1, le=100),
    days: int = Query(7, ge=1, le=90),
):
    """Generate a signed JWT demo token. Only callable from localhost."""
    _require_localhost(request)

    now = datetime.now(timezone.utc)
    payload = {
        "sub": label,
        "jti": str(uuid.uuid4()),   # unique ID for use-count tracking
        "iat": now,
        "exp": now + timedelta(days=days),
        "max_uses": uses,
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm="HS256")
    return {
        "token": token,
        "label": label,
        "expires_in_days": days,
        "max_uses": uses,
    }
