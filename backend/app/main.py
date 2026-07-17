from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from app.middleware.killswitch import KillswitchMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.routers import research, admin, navigate, agentic_code

app = FastAPI(
    title="AgentDemo API",
    description="Multi-agent content research & creation pipeline.",
    version="0.1.0",
)

# Middleware order matters: killswitch → rate limit → routes
app.add_middleware(KillswitchMiddleware)
app.add_middleware(RateLimitMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to your Vercel domain before final deploy
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(research.router)
app.include_router(admin.router)
app.include_router(navigate.router)
app.include_router(agentic_code.router)


@app.get("/")
def root():
    content = """
╔═══════════════════════════════════════╗
║                                       ║
║              AIWIKI                   ║
║                                       ║
║   Multi-Agent Content Pipeline        ║
║                                       ║
║   Four specialized AI agents          ║
║   collaborate to research, filter,    ║
║   write, and edit articles on any     ║
║   topic you choose.                   ║
║                                       ║
║   Made by @pedrovanzo                 ║
║                                       ║
╚═══════════════════════════════════════╝
"""
    return PlainTextResponse(content)


@app.get("/health")
def health():
    return {"status": "ok"}
