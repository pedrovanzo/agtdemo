import re
import json
import logging
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator
from crewai import Task, Crew, Process
from app.agents.researcher import build_researcher

router = APIRouter(tags=["research"])
logger = logging.getLogger(__name__)

MAX_TOPIC_LENGTH = 200
# Allow letters, numbers, spaces, and basic punctuation — block injection chars
_SAFE_TOPIC = re.compile(r"^[\w\s\-.,!?'\"()]+$")


class ResearchRequest(BaseModel):
    topic: str

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


def _send_log(message: str):
    """Format a log message as SSE."""
    event = {"type": "log", "message": message}
    return f"data: {json.dumps(event)}\n\n"


def _send_result(result: str):
    """Format a result message as SSE."""
    event = {"type": "result", "data": result}
    return f"data: {json.dumps(event)}\n\n"


def _send_error(error: str):
    """Format an error message as SSE."""
    event = {"type": "error", "message": error}
    return f"data: {json.dumps(event)}\n\n"


def _run_researcher(topic: str):
    """Generator that yields log messages and final research result as SSE."""
    try:
        yield _send_log(f"🔍 Starting research on: {topic}")

        yield _send_log("📦 Initializing researcher agent...")
        researcher = build_researcher()
        yield _send_log("✓ Researcher agent initialized")

        yield _send_log("🌐 Creating research task...")
        research_task = Task(
            description=f"Search the web and gather the latest information, news, and developments about: {topic}. Collect diverse, credible sources. Be concise.",
            expected_output="A brief compilation of the most important facts about the topic (max 3-5 bullet points).",
            agent=researcher,
        )
        yield _send_log("✓ Research task created")

        yield _send_log("🚀 Executing research task...")
        crew = Crew(
            agents=[researcher],
            tasks=[research_task],
            process=Process.sequential,
            verbose=True,
        )
        result = crew.kickoff()
        yield _send_log("✓ Research complete")

        yield _send_result(str(result))

    except Exception as e:
        logger.error(f"Research error: {str(e)}", exc_info=True)
        yield _send_error(f"Error during research: {str(e)}")


@router.post("/research")
async def research(body: ResearchRequest):
    return StreamingResponse(
        _run_researcher(body.topic),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
