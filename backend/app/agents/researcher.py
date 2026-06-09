from crewai import Agent, LLM
from crewai_tools import SerperDevTool
from app.config import OPENROUTER_MODEL, OPENROUTER_API_KEY

search_tool = SerperDevTool()


def build_researcher() -> Agent:
    llm = LLM(
        model=f"openrouter/{OPENROUTER_MODEL}",
        api_key=OPENROUTER_API_KEY,
        max_tokens=1024,
    )

    return Agent(
        role="Lead Topic Researcher",
        goal="Find the latest, most relevant information about the given topic using web search.",
        backstory=(
            "You are an expert internet researcher who knows how to locate authoritative sources, "
            "recent news, and diverse perspectives on any topic quickly and efficiently."
        ),
        tools=[search_tool],
        llm=llm,
        verbose=True,
    )
