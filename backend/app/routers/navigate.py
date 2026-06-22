import json
import asyncio
import threading
import logging
import os
from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.config import OLLAMA_BASE_URL

router = APIRouter(tags=["navigate"])
logger = logging.getLogger(__name__)


class NavigateRequest(BaseModel):
    company: str
    url: str
    file_query: str
    download_folder: str


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


# ── Capture browser-use internal logs and surface them in the UI ──────────────

class _BULogHandler(logging.Handler):
    """Forward browser-use WARNING+ logs to the SSE stream."""
    def __init__(self, emit_fn):
        super().__init__(level=logging.WARNING)
        self._emit = emit_fn

    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = self.format(record)
            self._emit({"type": "log", "agent": "Pilot",
                        "message": f"   ⚠️ [bu] {msg[:200]}"})
        except Exception:
            pass


def _run_pipeline_thread(
    company: str,
    url: str,
    file_query: str,
    download_folder: str,
    queue: asyncio.Queue,
    fastapi_loop: asyncio.AbstractEventLoop,
) -> None:
    def emit(event: dict) -> None:
        fastapi_loop.call_soon_threadsafe(queue.put_nowait, event)

    def done() -> None:
        fastapi_loop.call_soon_threadsafe(queue.put_nowait, None)

    # Attach log forwarder to browser-use's logger tree
    bu_handler = _BULogHandler(emit)
    bu_root = logging.getLogger("browser_use")
    bu_root.addHandler(bu_handler)

    async def _pipeline() -> None:
        from crewai import Agent as CrewAgent, Task, Crew
        from langchain_ollama import ChatOllama

        # ── Pilot ──────────────────────────────────────────────────────
        emit({"type": "agent_start", "agent": "Pilot"})

        try:
            from app.config import OLLAMA_MODEL, OLLAMA_BASE_URL
            from app.tools.browser_tools import (
                BrowserSession,
                DownloadFinancialStatementTool,
            )

            emit({"type": "log", "agent": "Pilot",
                  "message": f"🌍 Initializing browser session..."})

            browser_session = BrowserSession()
            browser_session.start()

            emit({"type": "log", "agent": "Pilot",
                  "message": f"🔧 Creating download tool..."})

            download_tool = DownloadFinancialStatementTool(browser_session, download_folder)

            emit({"type": "log", "agent": "Pilot",
                  "message": f"🤖 Initializing Ollama LLM ({OLLAMA_MODEL})..."})

            Path(download_folder).mkdir(parents=True, exist_ok=True)

            emit({"type": "log", "agent": "Pilot",
                  "message": f"📋 Task: {file_query}"})

            # Configure Ollama for CrewAI
            import os as os_module

            # Disable telemetry
            os_module.environ['CREWAI_TELEMETRY_OPT_OUT'] = 'true'

            # Configure CrewAI to use Ollama by setting the LLM model
            # CrewAI v0.1+ uses environment variables or Agent parameter
            os_module.environ['OLLAMA_MODEL'] = OLLAMA_MODEL
            os_module.environ['OLLAMA_BASE_URL'] = OLLAMA_BASE_URL

            from crewai import LLM

            # CrewAI uses LiteLLM under the hood; Ollama models use the "ollama/" prefix
            crewai_llm = LLM(
                model=f"ollama/{OLLAMA_MODEL}",
                base_url=OLLAMA_BASE_URL,
                api_key="ollama",
            )

            pilot_agent = CrewAgent(
                role="Document Downloader",
                goal="Download the Financial Statements PDF from a company IR page",
                backstory="You call the download_financial_statement tool with the IR URL and return the result.",
                tools=[download_tool],
                llm=crewai_llm,
                verbose=True,
                allow_delegation=False,
                max_iter=2,
            )

            emit({"type": "log", "agent": "Pilot",
                  "message": f"🚀 Starting download task..."})

            ir_url = url.strip() if url.strip() else f"https://www.google.com/search?q={company}+investor+relations"

            task = Task(
                description=(
                    f"Call download_financial_statement with this URL: {ir_url}\n"
                    f"The tool will navigate, find the most recent Financial Statements PDF, "
                    f"and save it to: {download_folder}\n"
                    f"Return the result from the tool exactly as-is."
                ),
                agent=pilot_agent,
                expected_output="The filename and full path of the downloaded PDF.",
            )

            emit({"type": "log", "agent": "Pilot",
                  "message": f"🌐 Navigating to: {ir_url}"})
            emit({"type": "log", "agent": "Pilot",
                  "message": f"🤖 {OLLAMA_MODEL} via Ollama (local, 100% free)"})

            crew = Crew(
                agents=[pilot_agent],
                tasks=[task],
                verbose=False,
                memory=False,
            )

            emit({"type": "log", "agent": "Pilot",
                  "message": "⏳ Running agent (this may take 60-120 seconds)..."})

            try:
                # Execute crew (this is synchronous, run in thread pool)
                result = await asyncio.to_thread(crew.kickoff)

                final_result = result.raw if hasattr(result, 'raw') else str(result)
                emit({"type": "log", "agent": "Pilot",
                      "message": "✅ Agent finished"})
                emit({"type": "log", "agent": "Pilot",
                      "message": f"📝 Result:\n{str(final_result)[:500]}"})
                emit({"type": "agent_result", "agent": "Pilot", "data": str(final_result)})

            except Exception as e:
                emit({"type": "log", "agent": "Pilot",
                      "message": f"❌ Error: {type(e).__name__}: {str(e)[:200]}"})
                logger.error(f"Agent error: {e}", exc_info=True)
                raise

            finally:
                # Clean up browser session
                try:
                    browser_session.close()
                except Exception as e:
                    logger.warning(f"Error closing browser: {e}")

        except Exception as e:
            logger.error("Pilot agent error", exc_info=True)
            error_type = type(e).__name__
            error_msg = str(e)

            # Log detailed error information
            emit({"type": "log", "agent": "Pilot",
                  "message": f"❌ Exception type: {error_type}"})
            emit({"type": "log", "agent": "Pilot",
                  "message": f"❌ Error message: {error_msg[:300]}"})

            if "items" in error_msg.lower():
                emit({"type": "log", "agent": "Pilot",
                      "message": "❌ Root cause: KeyError for 'items' - likely in message/dict access"})
                emit({"type": "log", "agent": "Pilot",
                      "message": "❌ Possible causes: 1) Ollama not responding properly, 2) ChatOllama invoke() format issue, 3) Page parsing error"})

            emit({"type": "error", "message": f"Pilot failed: {error_type}: {error_msg[:200]}"})

        emit({"type": "agent_done", "agent": "Pilot"})

    try:
        asyncio.run(_pipeline())
    finally:
        bu_root.removeHandler(bu_handler)
        done()


async def _stream_navigate(
    company: str, url: str, file_query: str, download_folder: str
):
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[dict | None] = asyncio.Queue()

    thread = threading.Thread(
        target=_run_pipeline_thread,
        args=(company, url, file_query, download_folder, queue, loop),
        daemon=True,
    )
    thread.start()

    while True:
        event = await queue.get()
        if event is None:
            break
        yield _sse(event)

    thread.join(timeout=10)


@router.post("/navigate")
async def navigate(body: NavigateRequest):
    try:
        import httpx
        async with httpx.AsyncClient(timeout=5) as client:
            await client.get(f"{OLLAMA_BASE_URL}/api/tags")
    except Exception:
        return StreamingResponse(
            iter([_sse({"type": "error",
                        "message": "Ollama not running. Start it with: ollama serve (or 'ollama pull llava' first to download the model)"})]),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return StreamingResponse(
        _stream_navigate(
            body.company,
            body.url,
            body.file_query,
            os.path.expanduser(body.download_folder),
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
