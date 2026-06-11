from crewai import Agent, LLM
from app.config import OPENROUTER_MODEL


def build_editor(openrouter_api_key: str) -> Agent:
    llm = LLM(
        model=f"openrouter/{OPENROUTER_MODEL}",
        api_key=openrouter_api_key,
        max_tokens=1024,
    )

    return Agent(
        role="Senior Copyeditor",
        goal=(
            "Review the article draft, refine tone and formatting, eliminate repetition, "
            "and produce a polished final version ready for publication."
        ),
        backstory=(
            "You are a meticulous senior editor at a major publication. You have high standards "
            "for clarity, flow, and style. You make every sentence earn its place."
        ),
        tools=[],
        llm=llm,
        max_iter=1,
        verbose=True,
    )
