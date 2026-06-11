from crewai import Agent, LLM
from app.config import OPENROUTER_MODEL


def build_analyst(openrouter_api_key: str) -> Agent:
    llm = LLM(
        model=f"openrouter/{OPENROUTER_MODEL}",
        api_key=openrouter_api_key,
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
        max_iter=1,
        verbose=True,
    )
