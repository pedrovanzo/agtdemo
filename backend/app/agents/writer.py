from crewai import Agent
from app.agents.researcher import _llm


def build_writer() -> Agent:
    return Agent(
        role="Technical Writer & Journalist",
        goal=(
            "Transform the curated, prioritized research summary into a cohesive, "
            "well-structured, and engaging article draft."
        ),
        backstory=(
            "You are a skilled science and technology journalist who excels at turning complex "
            "information into clear, compelling narratives for an educated general audience."
        ),
        tools=[],
        llm=_llm(),
        verbose=True,
    )
