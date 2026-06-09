from crewai import Agent
from app.config import OPENROUTER_MODEL, OPENROUTER_API_KEY
from langchain_openai import ChatOpenAI


def build_analyst() -> Agent:
    # Create LLM with explicit token limits
    llm = ChatOpenAI(
        model=OPENROUTER_MODEL,
        api_key=OPENROUTER_API_KEY,
        base_url="https://openrouter.ai/api/v1",
        max_tokens=1024,
    )

    return Agent(
        role="Data Analyst & Quality Controller",
        goal=(
            "Ingest raw research data, verify recency, filter noise, "
            "and rank findings by relevance and importance."
        ),
        backstory=(
            "You are a rigorous analyst with a sharp eye for separating signal from noise. "
            "You prioritize recent, credible information and discard anything outdated or irrelevant."
        ),
        tools=[],
        llm=llm,
        verbose=True,
    )
