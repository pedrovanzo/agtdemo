"""
Real project-folder resolution for Agentic Code output. Every project lands
at agtdemo/dist/<n>-<slug>/, where n is a global iteration counter across
all projects ever built here — see ADR 0003.
"""

import re
from pathlib import Path

DIST_ROOT = Path(__file__).resolve().parents[3] / "dist"

_NUMBERED_DIR_RE = re.compile(r"^(\d+)-")
_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(text: str) -> str:
    slug = _SLUG_RE.sub("-", text.lower().strip())
    return slug.strip("-")


def create_project_dir(base_name: str) -> str:
    """Resolves the next global iteration number and creates dist/<n>-<slug>/."""
    DIST_ROOT.mkdir(parents=True, exist_ok=True)
    slug = slugify(base_name) or "untitled-project"
    existing = [
        int(match.group(1))
        for entry in DIST_ROOT.iterdir()
        if entry.is_dir() and (match := _NUMBERED_DIR_RE.match(entry.name))
    ]
    next_n = max(existing, default=0) + 1
    dir_name = f"{next_n}-{slug}"
    (DIST_ROOT / dir_name).mkdir(parents=True, exist_ok=True)
    return dir_name


def resolve_path_in_project(project_dir: str, relative_path: str) -> Path:
    """Resolves relative_path inside dist/<project_dir>/, rejecting any path that escapes it."""
    project_root = (DIST_ROOT / project_dir).resolve()
    target = (project_root / relative_path).resolve()
    try:
        target.relative_to(project_root)
    except ValueError:
        raise ValueError(f"path {relative_path!r} escapes the project directory")
    return target
