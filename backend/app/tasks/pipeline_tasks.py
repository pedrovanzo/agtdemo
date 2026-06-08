from crewai import Task
from crewai import Agent


def build_tasks(topic: str, researcher: Agent, analyst: Agent, writer: Agent, editor: Agent) -> list[Task]:
    research_task = Task(
        description=f"Search the web and gather the latest information, news, and developments about: {topic}. Collect diverse, credible sources.",
        expected_output="A raw compilation of facts, quotes, and links about the topic.",
        agent=researcher,
    )

    analysis_task = Task(
        description="Review the raw research. Filter out outdated or low-quality content. Rank the remaining findings by importance and relevance.",
        expected_output="A structured, prioritized list of the most significant and recent findings about the topic.",
        agent=analyst,
        context=[research_task],  # receives output of research_task
    )

    writing_task = Task(
        description="Using the prioritized research summary, write a comprehensive, engaging article draft with a clear introduction, body, and conclusion.",
        expected_output="A full article draft in markdown format, well-structured and informative.",
        agent=writer,
        context=[analysis_task],
    )

    editing_task = Task(
        description="Polish the article draft. Improve flow, fix repetition, refine tone, and ensure the piece is publication-ready.",
        expected_output="The final, polished article in markdown format.",
        agent=editor,
        context=[writing_task],
    )

    return [research_task, analysis_task, writing_task, editing_task]
