import json
import logging
import re

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.agentic_code.harnesses import FRONTEND_HARNESSES, build_harness_block
from app.config import AGENTIC_CODE_MODEL, OLLAMA_BASE_URL

router = APIRouter(tags=["agentic-code"])
logger = logging.getLogger(__name__)

_CODE_FENCE_RE = re.compile(r"^```[a-zA-Z0-9_-]*\n(.*)\n```$", re.DOTALL)


class PreviewRequest(BaseModel):
    request: str


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


def _strip_code_fence(text: str) -> str:
    """Models often wrap snippets in a ```lang ... ``` fence even when told not to."""
    match = _CODE_FENCE_RE.match(text.strip())
    return match.group(1).strip() if match else text


async def _ask_ollama(client: httpx.AsyncClient, prompt: str) -> str:
    resp = await client.post(
        f"{OLLAMA_BASE_URL}/api/generate",
        json={"model": AGENTIC_CODE_MODEL, "prompt": prompt, "stream": False},
    )
    resp.raise_for_status()
    return resp.json()["response"].strip()


async def _run_preview(request_text: str):
    """
    Minimal first wire per ADR 0003: two plain, one-shot calls to the local
    model — no CrewAI, no file writes. Streamed over SSE (matching the
    research/navigate routers) so each call's real completion time drives
    its own chat entry instead of both landing at once.
    """
    async with httpx.AsyncClient(timeout=90) as client:
        try:
            await client.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        except Exception:
            yield _sse({
                "type": "error",
                "message": f"Ollama not reachable at {OLLAMA_BASE_URL}. Start it with: ollama serve",
            })
            return

        question_prompt = (
            "You are the Intake Agent for a coding assistant. A user asked for "
            f'the following to be built:\n\n"{request_text}"\n\n'
            "Ask exactly ONE short clarifying question about output format "
            "(for example: single static HTML page vs. multi-page site vs. a "
            "framework like Next.js). Reply with only the question, nothing else."
        )
        snippet_prompt = (
            build_harness_block(FRONTEND_HARNESSES) +
            "You are a coding agent. A user asked for the following to be "
            f'built:\n\n"{request_text}"\n\n'
            "This is the initial snippet, so follow the house rules above for "
            "page scaffolding. Keep the core implementation focused (roughly "
            "10-20 lines, excluding boilerplate scaffold tags). Do not add "
            "explanation — just the code."
        )

        try:
            question = await _ask_ollama(client, question_prompt)
        except httpx.HTTPStatusError as e:
            logger.error(f"Ollama request failed: {e}")
            yield _sse({"type": "error", "message": f"Ollama request failed: {e}"})
            return
        yield _sse({"type": "question_ready", "question": question})

        yield _sse({"type": "log", "message": "Sketching a sample snippet…"})
        try:
            snippet = await _ask_ollama(client, snippet_prompt)
        except httpx.HTTPStatusError as e:
            logger.error(f"Ollama request failed: {e}")
            yield _sse({"type": "error", "message": f"Ollama request failed: {e}"})
            return
        yield _sse({"type": "snippet_ready", "snippet": _strip_code_fence(snippet)})


@router.post("/agentic-code/preview")
async def preview(body: PreviewRequest):
    request_text = body.request.strip()
    if not request_text:
        raise HTTPException(400, "request must not be empty")

    return StreamingResponse(
        _run_preview(request_text),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
