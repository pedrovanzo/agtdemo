from crewai import Agent
from crewai_tools import SerperDevTool
from app.config import OPENROUTER_MODEL, OPENROUTER_API_KEY
from langchain_openai import ChatOpenAI

search_tool = SerperDevTool()


def _llm():
    # Instantiated lazily so missing .env doesn't crash on import
    return ChatOpenAI(
        model=OPENROUTER_MODEL,
        api_key=OPENROUTER_API_KEY,
        base_url="https://openrouter.ai/api/v1",
    )


def build_researcher() -> Agent:
    return Agent(
        role="Lead Topic Researcher",
        goal="Find the latest, most relevant information about the given topic using web search.",
        backstory=(
            "You are an expert internet researcher who knows how to locate authoritative sources, "
            "recent news, and diverse perspectives on any topic quickly and efficiently."
        ),
        tools=[search_tool],
        llm=_llm(),
        verbose=True,
    )
