"""
Harnesses: small, fixed house-style rules prepended to code-generation
prompts, kept separate from per-request instructions so they can be
edited or extended without touching prompt-building logic. One list per
generation domain (frontend today; backend once real backend generation
exists) — extend by adding a new list and calling build_harness_block()
at that domain's prompt site, no new plumbing needed.
"""

FRONTEND_HARNESSES = [
    "If generating a full HTML page file, include full <html> and <head> tags.",
    "Default to Tailwind CSS via CDN and Tailwind utility classes for styling.",
    'Include <meta charset="UTF-8"> and a responsive viewport meta tag in <head>.',
    'No <style> blocks or style="" attributes — Tailwind utility classes only.',
    "Prefer semantic HTML5 elements (main, header, section) over generic <div> soup.",
    "Put all JavaScript in one <script> at the end of <body> — no inline onclick handlers.",
    "Design responsive by default — use Tailwind's sm:/md: prefixes even if not explicitly requested.",
    'For any icons, use Font Awesome via this CDN in <head>: <link rel="stylesheet" '
    'href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/7.3.0/css/all.min.css">. '
    'Use its <i class="fa-solid fa-..."></i> markup. Do not hand-write inline <svg> icons '
    "unless the request explicitly asks for custom/hand-drawn icons.",
]


def build_harness_block(harnesses: list[str]) -> str:
    """Joins a domain's harness rules into a prompt-ready instruction block."""
    if not harnesses:
        return ""
    rules = "\n".join(f"- {h}" for h in harnesses)
    return f"House rules — follow unless the request explicitly conflicts:\n{rules}\n\n"
