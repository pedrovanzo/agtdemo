from crewai import Agent, LLM
from crewai_tools import SerperDevTool
from app.config import OPENROUTER_MODEL
import os


def build_researcher(openrouter_api_key: str, serper_api_key: str) -> Agent:
    os.environ["SERPER_API_KEY"] = serper_api_key  # SerperDevTool reads from env

    llm = LLM(
        model=f"openrouter/{OPENROUTER_MODEL}",
        api_key=openrouter_api_key,
        max_tokens=1024,
    )

    return Agent(
        role="Lead Topic Researcher",
        goal="Find the latest, most relevant information about the given topic using web search.",
        backstory=(
            "You are an expert internet researcher who knows how to locate authoritative sources, "
            "recent news, and diverse perspectives on any topic quickly and efficiently."
        ),
        tools=[SerperDevTool()],
        llm=llm,
        max_iter=2,
        verbose=True,
    )
