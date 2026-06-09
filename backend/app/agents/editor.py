from crewai import Agent
from app.config import OPENROUTER_MODEL, OPENROUTER_API_KEY
from langchain_openai import ChatOpenAI


def build_editor() -> Agent:
    # Create LLM with explicit token limits
    llm = ChatOpenAI(
        model=OPENROUTER_MODEL,
        api_key=OPENROUTER_API_KEY,
        base_url="https://openrouter.ai/api/v1",
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
        verbose=True,
    )
