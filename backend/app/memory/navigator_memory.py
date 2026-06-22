"""
Long-term memory for the Browser Navigator pipeline.

Stores per-domain navigation paths discovered by agents across runs.
On the next run for the same domain, agents receive the remembered paths
as hints, reducing LLM calls from ~10 down to ~2.

Storage: a single JSON file next to this module.
No embeddings required — lookup is by exact domain key.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

_STORE = Path(__file__).parent / "memory_store.json"


def _load() -> dict:
    if not _STORE.exists():
        return {}
    try:
        return json.loads(_STORE.read_text())
    except Exception:
        logger.warning("Could not read memory store — starting fresh")
        return {}


def _save(data: dict) -> None:
    try:
        _STORE.write_text(json.dumps(data, indent=2))
    except Exception as e:
        logger.error(f"Could not write memory store: {e}")


def recall(url: str) -> dict | None:
    """Return stored navigation memory for the domain of the given URL, or None."""
    domain = urlparse(url).netloc
    return _load().get(domain)


def remember(
    url: str,
    shareholders_url: str | None = None,
    results_center_url: str | None = None,
    last_pdf_url: str | None = None,
    last_pdf_name: str | None = None,
) -> None:
    """Persist a successful navigation path for this domain."""
    domain = urlparse(url).netloc
    data = _load()
    existing = data.get(domain, {})

    data[domain] = {
        "domain": domain,
        "shareholders_url": shareholders_url or existing.get("shareholders_url"),
        "results_center_url": results_center_url or existing.get("results_center_url"),
        "last_pdf_url": last_pdf_url or existing.get("last_pdf_url"),
        "last_pdf_name": last_pdf_name or existing.get("last_pdf_name"),
        "run_count": existing.get("run_count", 0) + 1,
        "last_updated": datetime.now().isoformat(),
    }
    _save(data)


def format_for_agent(memory: dict) -> str:
    """Return a compact hint string to inject into a task description."""
    lines = ["LONG-TERM MEMORY (from previous runs on this site):"]
    if memory.get("shareholders_url"):
        lines.append(f"  - 'Information to Shareholders' was found at: {memory['shareholders_url']}")
    if memory.get("results_center_url"):
        lines.append(f"  - 'Results Center' was found at: {memory['results_center_url']}")
    if memory.get("last_pdf_url"):
        lines.append(f"  - Last financial statement PDF: {memory.get('last_pdf_name', '')} → {memory['last_pdf_url']}")
    lines.append("Use these URLs as starting points — navigate directly if they still exist.")
    return "\n".join(lines)
