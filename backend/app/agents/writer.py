from crewai import Agent, LLM
from app.config import OPENROUTER_MODEL


def build_writer(openrouter_api_key: str) -> Agent:
    llm = LLM(
        model=f"openrouter/{OPENROUTER_MODEL}",
        api_key=openrouter_api_key,
        max_tokens=1024,
    )

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
        llm=llm,
        max_iter=1,
        verbose=True,
    )
