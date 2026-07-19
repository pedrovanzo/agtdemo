import json
import logging
import re
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.agentic_code.harnesses import FRONTEND_HARNESSES, build_harness_block
from app.agentic_code.projects import create_project_dir, resolve_path_in_project, DIST_ROOT
from app.config import AGENTIC_CODE_MODEL, AGENTIC_CODE_NUM_CTX, AGENTIC_CODE_NUM_PREDICT, OLLAMA_BASE_URL

router = APIRouter(tags=["agentic-code"])
logger = logging.getLogger(__name__)

_CODE_FENCE_RE = re.compile(r"^```[a-zA-Z0-9_-]*\n(.*)\n```$", re.DOTALL)
_SEARCH_REPLACE_RE = re.compile(r"<<<<<<< SEARCH\n(.*?)\n=======\n(.*?)\n>>>>>>> REPLACE", re.DOTALL)

# Tailwind CDN is the only styling mechanism the harnesses allow (no <style>
# blocks, no custom CSS files) — if a generation pass drops this tag, the
# whole page silently loses all styling despite every class="" still being
# present. Verified real bug (2026-07-19): a multi-task mock-plan build lost
# this tag partway through and shipped a fully unstyled page with no error.
_TAILWIND_CDN_MARKER = "cdn.tailwindcss.com"

# Output length caps per call type — the question is one short sentence and
# a diff is a handful of changed lines, so both get a much tighter budget
# than a full file rewrite. Bounds worst-case generation time regardless of
# what the model decides to do with an unconstrained prompt.
_NUM_PREDICT_QUESTION = 150
_NUM_PREDICT_DIFF = 2048

# Diff-mode (SEARCH/REPLACE edits) is implemented and safe — the exact-match
# check in _apply_search_replace means a bad diff always falls back to a
# full rewrite rather than corrupting a file. But on gemma4:e4b-mlx it failed
# to apply cleanly on 2/2 real attempts, and each failure costs a wasted
# extra Ollama call on top of the fallback rewrite — net slower than skipping
# it outright. Disabled by default until diff reliability improves on this
# model; flip to True to re-enable without touching the rest of the flow.
_DIFF_MODE_ENABLED = False


class PreviewRequest(BaseModel):
    request: str


class CreateProjectRequest(BaseModel):
    name: str


class CreateProjectResponse(BaseModel):
    dir: str


class FileOpRequest(BaseModel):
    operation: Literal["create", "edit", "delete"]
    path: str
    preview: str


class WriteTaskRequest(BaseModel):
    project_dir: str
    request_context: str
    task_title: str
    ops: list[FileOpRequest]
    feedback: str | None = None


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


def _strip_code_fence(text: str) -> str:
    """Models often wrap snippets in a ```lang ... ``` fence even when told not to."""
    match = _CODE_FENCE_RE.match(text.strip())
    return match.group(1).strip() if match else text


async def _ask_ollama(client: httpx.AsyncClient, prompt: str, num_predict: int = AGENTIC_CODE_NUM_PREDICT) -> str:
    resp = await client.post(
        f"{OLLAMA_BASE_URL}/api/generate",
        json={
            "model": AGENTIC_CODE_MODEL,
            "prompt": prompt,
            "stream": False,
            # This model has an extended-thinking mode that's on by default —
            # measured burning an entire 1024-token budget on invisible
            # reasoning with zero visible output (response: "", done_reason:
            # "length"). Disabling it is a straight win: less compute per
            # call and the token budget goes to the actual answer.
            "think": False,
            "options": {"num_ctx": AGENTIC_CODE_NUM_CTX, "num_predict": num_predict},
        },
    )
    resp.raise_for_status()
    return resp.json()["response"].strip()


async def _run_preview(request_text: str):
    """
    Minimal first wire per ADR 0003: one real call to the local model for
    Intake's clarifying question — no CrewAI, no file writes. Real code
    generation happens later, per task, via /agentic-code/write-task, once
    the user approves a plan and grants permission for that task's file ops.
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
            "You are the Intake Agent for a coding assistant that builds a single, "
            "self-contained static HTML page per request — always one file, styled "
            f'with Tailwind CSS via CDN. A user asked for the following to be built:\n\n"{request_text}"\n\n'
            "Ask exactly ONE short clarifying question about content, style, tone, "
            "or specifics that would meaningfully change what you build. Do not ask "
            "about output format — it's always a single HTML page. Reply with only "
            "the question, nothing else."
        )

        try:
            question = await _ask_ollama(client, question_prompt, num_predict=_NUM_PREDICT_QUESTION)
        except httpx.HTTPError as e:
            logger.error(f"Ollama request failed: {e}")
            yield _sse({"type": "error", "message": f"Ollama request failed: {e}"})
            return
        except Exception as e:
            # Last-resort net: any unexpected failure here must still reach
            # the client as an error event, not silently kill the stream —
            # an uncaught exception in an SSE generator just ends the
            # connection with no signal, which reads as "nothing happened."
            logger.error(f"Unexpected error in preview: {e}", exc_info=True)
            yield _sse({"type": "error", "message": f"Unexpected error: {e}"})
            return
        yield _sse({"type": "question_ready", "question": question})


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


@router.post("/agentic-code/create-project", response_model=CreateProjectResponse)
async def create_project(body: CreateProjectRequest):
    dir_name = create_project_dir(body.name)
    return CreateProjectResponse(dir=dir_name)


def _file_prompt(
    request_context: str,
    task_title: str,
    op: FileOpRequest,
    existing_content: str | None,
    feedback: str | None,
) -> str:
    context = (
        f'The user\'s original request for this project was:\n\n"{request_context}"\n\n'
        f'You are working on the task "{task_title}", which is part of that request. '
        f'Write the complete contents of the file at path "{op.path}". Here is a sketch '
        f"of what it should contain:\n\n{op.preview}\n\n"
    )
    if existing_content is not None:
        context += f"This file already exists with the following contents:\n\n{existing_content}\n\n"
    if feedback is not None:
        context += (
            f'The user reviewed the current version and asked for this change: "{feedback}". '
            "Apply it and return the FULL updated file.\n\n"
        )
    elif existing_content is not None:
        context += "Apply the sketch above to it and return the FULL updated file.\n\n"
    return (
        build_harness_block(FRONTEND_HARNESSES)
        + context
        + "Reply with only the raw file contents — no explanation, no markdown fences."
    )


def _diff_prompt(
    request_context: str,
    task_title: str,
    op: FileOpRequest,
    existing_content: str,
    feedback: str | None,
) -> str:
    change_desc = f'the user asked for this change: "{feedback}"' if feedback is not None else f"this change: {op.preview}"
    return (
        build_harness_block(FRONTEND_HARNESSES)
        + f'The user\'s original request for this project was:\n\n"{request_context}"\n\n'
        + f'You are working on the task "{task_title}". The file at path "{op.path}" already '
        + f"has these contents:\n\n{existing_content}\n\n"
        + f"Apply {change_desc}\n\n"
        + "Output ONLY one or more SEARCH/REPLACE blocks describing the exact change(s), in this "
        + "exact format:\n\n<<<<<<< SEARCH\n(exact existing text to find, verbatim)\n=======\n"
        + "(replacement text)\n>>>>>>> REPLACE\n\n"
        + "The SEARCH text must match the existing file exactly, character for character, "
        + "including whitespace and indentation. Keep each SEARCH block as small as possible — "
        + "just the lines that actually change, with a little surrounding context only if needed "
        + "for uniqueness. Do not output the full file. Do not add explanation outside the blocks."
    )


async def _generate_full_file(
    client: httpx.AsyncClient,
    request_context: str,
    task_title: str,
    op: FileOpRequest,
    existing_content: str | None,
    feedback: str | None,
) -> str:
    """Generates full file content, with one automatic retry if an HTML file
    comes back missing the Tailwind CDN tag — the only styling mechanism the
    harnesses allow, so losing it means a fully unstyled page shipped with
    no error. The retry adds an explicit corrective instruction; if it's
    still missing after that, the caller surfaces a warning rather than
    silently accepting broken output."""
    content = _strip_code_fence(await _ask_ollama(client, _file_prompt(request_context, task_title, op, existing_content, feedback)))
    if op.path.endswith(".html") and _TAILWIND_CDN_MARKER not in content:
        retry_prompt = (
            _file_prompt(request_context, task_title, op, existing_content, feedback)
            + "\n\nIMPORTANT: your previous attempt did not include the Tailwind CDN script tag. "
            + f'You must include <script src="https://{_TAILWIND_CDN_MARKER}"></script> inside <head>.'
        )
        content = _strip_code_fence(await _ask_ollama(client, retry_prompt))
    return content


def _apply_search_replace(content: str, blocks_text: str) -> str | None:
    """Applies SEARCH/REPLACE blocks to content. Returns None (caller should
    fall back to a full rewrite) if there are no parseable blocks, or any
    SEARCH text doesn't match exactly once — never guesses at a fuzzy match."""
    blocks = _SEARCH_REPLACE_RE.findall(blocks_text)
    if not blocks:
        return None
    for search, replace in blocks:
        if content.count(search) != 1:
            return None
        content = content.replace(search, replace, 1)
    return content


async def _write_op(
    client: httpx.AsyncClient,
    project_dir: str,
    request_context: str,
    task_title: str,
    op: FileOpRequest,
    feedback: str | None,
) -> str:
    """Returns what happened: "deleted", "created", "edited_full" (no diff
    attempted — plain rewrite), "edited_diff", or "edited_full_fallback"
    (diff mode was attempted and failed to apply, full file rewritten
    instead) — the caller uses this to log when the slower fallback fires."""
    target = resolve_path_in_project(project_dir, op.path)

    if op.operation == "delete":
        target.unlink(missing_ok=True)
        return "deleted"

    # Read existing content whenever the file is already on disk, regardless
    # of the op's nominal "create"/"edit" label — a feedback-driven re-run of
    # a "create" op still needs to revise what's already there, not start
    # over blind and silently discard the file the user is reacting to.
    existing_content = target.read_text() if target.exists() else None
    diff_attempted = False

    if _DIFF_MODE_ENABLED and existing_content is not None:
        diff_attempted = True
        # Diff mode: model outputs only the changed lines, not the whole
        # file — much cheaper to generate. Falls back to a full rewrite
        # (same as before this existed) if the model's diff doesn't apply
        # cleanly, so correctness never regresses, only the speed win is lost.
        diff_response = await _ask_ollama(
            client,
            _diff_prompt(request_context, task_title, op, existing_content, feedback),
            num_predict=_NUM_PREDICT_DIFF,
        )
        patched = _apply_search_replace(existing_content, diff_response)
        if patched is not None:
            target.write_text(patched)
            return "edited_diff"

    content = await _generate_full_file(client, request_context, task_title, op, existing_content, feedback)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content)
    if existing_content is None:
        return "created"
    return "edited_full_fallback" if diff_attempted else "edited_full"


async def _run_write_task(
    project_dir: str,
    request_context: str,
    task_title: str,
    ops: list[FileOpRequest],
    feedback: str | None,
):
    if not (DIST_ROOT / project_dir).is_dir():
        yield _sse({"type": "error", "message": f"Project directory {project_dir!r} does not exist."})
        return

    # Edit ops re-send the file's full existing content as part of the
    # prompt, which on this local model can take much longer than a plain
    # create — 90s (fine for the short preview call) was routinely too
    # short and left a bare httpx.ReadTimeout uncaught below, silently
    # killing the stream with no error event and no completed write.
    async with httpx.AsyncClient(timeout=300) as client:
        for op in ops:
            yield _sse({"type": "log", "message": f"Writing {op.path}…"})
            try:
                result = await _write_op(client, project_dir, request_context, task_title, op, feedback)
            except httpx.HTTPError as e:
                logger.error(f"Ollama request failed: {e}")
                yield _sse({"type": "error", "message": f"Ollama request failed: {e}"})
                return
            except ValueError as e:
                logger.error(f"Rejected file write: {e}")
                yield _sse({"type": "error", "message": str(e)})
                return
            except Exception as e:
                # Same last-resort net as _run_preview — never let an
                # unexpected exception here silently end the stream with no
                # signal to the client mid-task.
                logger.error(f"Unexpected error writing {op.path}: {e}", exc_info=True)
                yield _sse({"type": "error", "message": f"Unexpected error writing {op.path}: {e}"})
                return
            if result == "edited_full_fallback":
                yield _sse({"type": "log", "message": f"Diff didn't apply cleanly for {op.path} — rewrote the full file instead."})
            if op.operation != "delete" and op.path.endswith(".html"):
                final_content = resolve_path_in_project(project_dir, op.path).read_text()
                if _TAILWIND_CDN_MARKER not in final_content:
                    yield _sse({
                        "type": "log",
                        "message": f"Warning: {op.path} may be missing Tailwind styling — CDN tag not found even after a retry.",
                    })
            yield _sse({"type": "file_written", "path": op.path})

    yield _sse({"type": "task_complete"})


@router.post("/agentic-code/write-task")
async def write_task(body: WriteTaskRequest):
    return StreamingResponse(
        _run_write_task(body.project_dir, body.request_context, body.task_title, body.ops, body.feedback),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
