import re
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, field_validator
from crewai import Crew, Process
from app.agents.researcher import build_researcher
from app.agents.analyst import build_analyst
from app.agents.writer import build_writer
from app.agents.editor import build_editor
from app.tasks.pipeline_tasks import build_tasks

router = APIRouter(tags=["research"])

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


def _run_pipeline(topic: str):
    """Generator that yields agent status updates and final article as SSE."""
    researcher = build_researcher()
    analyst = build_analyst()
    writer = build_writer()
    editor = build_editor()
    tasks = build_tasks(topic, researcher, analyst, writer, editor)

    crew = Crew(
        agents=[researcher, analyst, writer, editor],
        tasks=tasks,
        process=Process.sequential,
        verbose=True,
    )

    # Yield pipeline start event
    yield "data: {\"event\": \"start\", \"agent\": \"Researcher\"}\n\n"

    # CrewAI doesn't natively stream per-agent — we run and yield stage markers
    # A more advanced implementation would hook into CrewAI callbacks
    result = crew.kickoff()

    yield f"data: {{\"event\": \"complete\", \"article\": {repr(str(result))}}}\n\n"


@router.post("/research")
async def research(body: ResearchRequest):
    return StreamingResponse(
        _run_pipeline(body.topic),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
