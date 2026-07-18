"""
Harnesses: small, fixed house-style rules prepended to code-generation
prompts, kept separate from per-request instructions so they can be
edited or extended without touching prompt-building logic. One list per
generation domain (frontend today; backend once real backend generation
exists) — extend by adding a new list and calling build_harness_block()
at that domain's prompt site, no new plumbing needed.
"""

FRONTEND_HARNESSES = [
    "If this is the initial snippet, include full <html> and <head> tags.",
    "Default to Tailwind CSS via CDN and Tailwind utility classes for styling.",
    'Include <meta charset="UTF-8"> and a responsive viewport meta tag in <head>.',
    'No <style> blocks or style="" attributes — Tailwind utility classes only.',
    "Prefer semantic HTML5 elements (main, header, section) over generic <div> soup.",
    "Put all JavaScript in one <script> at the end of <body> — no inline onclick handlers.",
    "Design responsive by default — use Tailwind's sm:/md: prefixes even if not explicitly requested.",
]


def build_harness_block(harnesses: list[str]) -> str:
    """Joins a domain's harness rules into a prompt-ready instruction block."""
    if not harnesses:
        return ""
    rules = "\n".join(f"- {h}" for h in harnesses)
    return f"House rules — follow unless the request explicitly conflicts:\n{rules}\n\n"
