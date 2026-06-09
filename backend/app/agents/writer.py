from crewai import Agent
from app.config import OPENROUTER_MODEL, OPENROUTER_API_KEY
from langchain_openai import ChatOpenAI


def build_writer() -> Agent:
    # Create LLM with explicit token limits
    llm = ChatOpenAI(
        model=OPENROUTER_MODEL,
        api_key=OPENROUTER_API_KEY,
        base_url="https://openrouter.ai/api/v1",
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
        verbose=True,
    )
