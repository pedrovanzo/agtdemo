from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.middleware.killswitch import KillswitchMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.token_auth import TokenAuthMiddleware
from app.routers import research, admin

app = FastAPI(
    title="AgentDemo API",
    description="Multi-agent content research & creation pipeline.",
    version="0.1.0",
)

# Middleware order matters: killswitch → rate limit → token auth → routes
app.add_middleware(KillswitchMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(TokenAuthMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to your Vercel domain before final deploy
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(research.router)
app.include_router(admin.router)


@app.get("/health")
def health():
    return {"status": "ok"}
