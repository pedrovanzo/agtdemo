from crewai import Agent
from app.agents.researcher import _llm


def build_editor() -> Agent:
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
        llm=_llm(),
        verbose=True,
    )
