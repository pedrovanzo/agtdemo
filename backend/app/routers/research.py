import re
import json
import time
import logging
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator
from crewai import Task, Crew, Process
from app.agents.researcher import build_researcher
from app.agents.analyst import build_analyst
from app.agents.writer import build_writer
from app.agents.editor import build_editor
from app.config import OPENROUTER_API_KEY, SERPER_API_KEY

router = APIRouter(tags=["research"])
logger = logging.getLogger(__name__)

MAX_TOPIC_LENGTH = 200
_SAFE_TOPIC = re.compile(r"^[\w\s\-.,!?'\"()]+$")


class ResearchRequest(BaseModel):
    topic: str
    openrouter_api_key: str | None = None
    serper_api_key: str | None = None
    cost_safe: bool = False

    @field_validator("topic")
    @classmethod
    def validate_topic(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Topic cannot be empty.")
        if len(v) > MAX_TOPIC_LENGTH:
            raise ValueError(f"Topic must be {MAX_TOPIC_LENGTH} characters or fewer.")
        if not _SAFE_TOPIC.match(v):
            raise ValueError("Topic contains invalid characters.")
        return v


@router.get("/credentials/status")
def credentials_status():
    return {
        "openrouter": bool(OPENROUTER_API_KEY),
        "serper": bool(SERPER_API_KEY),
    }


def _send_agent_start(agent: str) -> str:
    return f"data: {json.dumps({'type': 'agent_start', 'agent': agent})}\n\n"


def _send_agent_done(agent: str) -> str:
    return f"data: {json.dumps({'type': 'agent_done', 'agent': agent})}\n\n"


def _send_agent_result(agent: str, result: str) -> str:
    return f"data: {json.dumps({'type': 'agent_result', 'agent': agent, 'data': result})}\n\n"


def _send_log(agent: str, message: str) -> str:
    return f"data: {json.dumps({'type': 'log', 'agent': agent, 'message': message})}\n\n"


def _send_error(message: str) -> str:
    return f"data: {json.dumps({'type': 'error', 'message': message})}\n\n"


def _run_pipeline(topic: str, openrouter_key: str, serper_key: str, cost_safe: bool = False):
    """Sequential pipeline: Researcher → Analyst → Writer → Editor. Each agent runs in its own Crew."""

    # ── Researcher ──────────────────────────────────────────────────────────
    yield _send_agent_start("Researcher")
    researcher_result = None
    try:
        yield _send_log("Researcher", f"🔍 Starting research on: {topic}")
        yield _send_log("Researcher", "📦 Initializing researcher agent...")
        researcher = build_researcher(openrouter_key, serper_key)
        yield _send_log("Researcher", "✓ Researcher agent ready")

        research_task = Task(
            description=(
                f"Search the web and gather the latest information, news, and developments about: {topic}. "
                "Collect diverse, credible sources. Be concise."
            ),
            expected_output="A brief compilation of the most important facts about the topic (max 3-5 bullet points).",
            agent=researcher,
        )
        yield _send_log("Researcher", "🚀 Running research task...")
        crew = Crew(
            agents=[researcher],
            tasks=[research_task],
            process=Process.sequential,
            verbose=True,
        )
        researcher_result = str(crew.kickoff())
        yield _send_log("Researcher", "✓ Research complete")
        yield _send_agent_result("Researcher", researcher_result)

    except Exception as e:
        logger.error(f"Researcher error: {str(e)}", exc_info=True)
        yield _send_error(f"Researcher failed: {str(e)}")
    finally:
        yield _send_agent_done("Researcher")

    if researcher_result is None:
        return

    # ── Analyst ─────────────────────────────────────────────────────────────
    yield _send_agent_start("Analyst")
    analyst_result = None
    try:
        if cost_safe:
            yield _send_log("Analyst", "⏳ Pausing 10 s — free-tier rate-limit buffer...")
            time.sleep(10)
        yield _send_log("Analyst", "🔬 Initializing analyst agent...")
        analyst = build_analyst(openrouter_key)
        yield _send_log("Analyst", "✓ Analyst agent ready")

        analysis_task = Task(
            description=(
                f"You received the following raw research findings about '{topic}':\n\n"
                f"{researcher_result}\n\n"
                "Filter and rank this information. Remove duplicates, flag questionable claims, "
                "and return only the most accurate and relevant facts."
            ),
            expected_output="A clean, ranked list of verified facts (3-5 bullet points). Note any caveats.",
            agent=analyst,
        )
        yield _send_log("Analyst", "🚀 Running analysis task...")
        crew = Crew(
            agents=[analyst],
            tasks=[analysis_task],
            process=Process.sequential,
            verbose=True,
        )
        analyst_result = str(crew.kickoff())
        yield _send_log("Analyst", "✓ Analysis complete")
        yield _send_agent_result("Analyst", analyst_result)

    except Exception as e:
        logger.error(f"Analyst error: {str(e)}", exc_info=True)
        yield _send_error(f"Analyst failed: {str(e)}")
    finally:
        yield _send_agent_done("Analyst")

    if analyst_result is None:
        return

    # ── Writer ──────────────────────────────────────────────────────────────
    yield _send_agent_start("Writer")
    writer_result = None
    try:
        if cost_safe:
            yield _send_log("Writer", "⏳ Pausing 10 s — free-tier rate-limit buffer...")
            time.sleep(10)
        yield _send_log("Writer", "✍️ Initializing writer agent...")
        writer = build_writer(openrouter_key)
        yield _send_log("Writer", "✓ Writer agent ready")

        writing_task = Task(
            description=(
                f"You received the following verified research findings about '{topic}':\n\n"
                f"{analyst_result}\n\n"
                "Write a short, engaging article for a general audience. Use a clear structure: "
                "a brief intro, a few body paragraphs covering the key facts, and a short conclusion. "
                "Keep it concise — this is a demo, not a full feature piece."
            ),
            expected_output=(
                "A short article (3-4 paragraphs) with a title, intro, body, and conclusion. "
                "Plain prose, no bullet points."
            ),
            agent=writer,
        )
        yield _send_log("Writer", "🚀 Running writing task...")
        crew = Crew(
            agents=[writer],
            tasks=[writing_task],
            process=Process.sequential,
            verbose=True,
        )
        writer_result = str(crew.kickoff())
        yield _send_log("Writer", "✓ Draft complete")
        yield _send_agent_result("Writer", writer_result)

    except Exception as e:
        logger.error(f"Writer error: {str(e)}", exc_info=True)
        yield _send_error(f"Writer failed: {str(e)}")
    finally:
        yield _send_agent_done("Writer")

    if writer_result is None:
        return

    # ── Editor ──────────────────────────────────────────────────────────────
    yield _send_agent_start("Editor")
    try:
        if cost_safe:
            yield _send_log("Editor", "⏳ Pausing 10 s — free-tier rate-limit buffer...")
            time.sleep(10)
        yield _send_log("Editor", "📝 Initializing editor agent...")
        editor = build_editor(openrouter_key)
        yield _send_log("Editor", "✓ Editor agent ready")

        editing_task = Task(
            description=(
                f"You received the following article draft about '{topic}':\n\n"
                f"{writer_result}\n\n"
                "Polish this draft: fix grammar, improve flow, cut any repetition, and ensure "
                "a consistent tone throughout. Do not add new facts — only refine what's there."
            ),
            expected_output=(
                "The final, polished article. Same structure as the draft but tightened and refined. "
                "Ready to publish."
            ),
            agent=editor,
        )
        yield _send_log("Editor", "🚀 Running editing task...")
        crew = Crew(
            agents=[editor],
            tasks=[editing_task],
            process=Process.sequential,
            verbose=True,
        )
        editor_result = str(crew.kickoff())
        yield _send_log("Editor", "✓ Editing complete — pipeline finished")
        yield _send_agent_result("Editor", editor_result)

    except Exception as e:
        logger.error(f"Editor error: {str(e)}", exc_info=True)
        yield _send_error(f"Editor failed: {str(e)}")
    finally:
        yield _send_agent_done("Editor")


@router.post("/research")
async def research(body: ResearchRequest):
    openrouter_key = body.openrouter_api_key or OPENROUTER_API_KEY
    serper_key = body.serper_api_key or SERPER_API_KEY

    missing = []
    if not openrouter_key:
        missing.append("OpenRouter API key")
    if not serper_key:
        missing.append("Serper API key")
    if missing:
        return StreamingResponse(
            iter([_send_error(f"Missing credentials: {', '.join(missing)}. Provide them via the credentials panel.")]),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return StreamingResponse(
        _run_pipeline(body.topic, openrouter_key, serper_key, body.cost_safe),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
