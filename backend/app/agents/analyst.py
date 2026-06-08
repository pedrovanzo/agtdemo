from crewai import Agent
from app.agents.researcher import _llm


def build_analyst() -> Agent:
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
        tools=[],  # reasoning only — no search tools
        llm=_llm(),
        verbose=True,
    )
