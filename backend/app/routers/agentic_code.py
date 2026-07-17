import logging
import re

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import AGENTIC_CODE_MODEL, OLLAMA_BASE_URL

router = APIRouter(tags=["agentic-code"])
logger = logging.getLogger(__name__)

_CODE_FENCE_RE = re.compile(r"^```[a-zA-Z0-9_-]*\n(.*)\n```$", re.DOTALL)


class PreviewRequest(BaseModel):
    request: str


class PreviewResponse(BaseModel):
    question: str
    snippet: str


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


@router.post("/agentic-code/preview", response_model=PreviewResponse)
async def preview(body: PreviewRequest):
    """
    Minimal first wire per ADR 0003: two plain, one-shot calls to the local
    model — no CrewAI, no streaming, no file writes. Proves the model is
    reachable and produces something useful before building the real
    session-based pipeline.
    """
    request_text = body.request.strip()
    if not request_text:
        raise HTTPException(400, "request must not be empty")

    async with httpx.AsyncClient(timeout=90) as client:
        try:
            await client.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        except Exception:
            raise HTTPException(
                503,
                f"Ollama not reachable at {OLLAMA_BASE_URL}. Start it with: ollama serve",
            )

        question_prompt = (
            "You are the Intake Agent for a coding assistant. A user asked for "
            f'the following to be built:\n\n"{request_text}"\n\n'
            "Ask exactly ONE short clarifying question about output format "
            "(for example: single static HTML page vs. multi-page site vs. a "
            "framework like Next.js). Reply with only the question, nothing else."
        )
        snippet_prompt = (
            "You are a coding agent. A user asked for the following to be "
            f'built:\n\n"{request_text}"\n\n'
            "Write ONE short representative code snippet (10-20 lines) showing "
            "what the core implementation might look like. Do not write a full "
            "file or add explanation — just the snippet."
        )

        try:
            question = await _ask_ollama(client, question_prompt)
            snippet = await _ask_ollama(client, snippet_prompt)
        except httpx.HTTPStatusError as e:
            logger.error(f"Ollama request failed: {e}")
            raise HTTPException(502, f"Ollama request failed: {e}")

    return PreviewResponse(question=question, snippet=_strip_code_fence(snippet))
