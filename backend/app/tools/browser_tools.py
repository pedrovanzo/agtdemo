from __future__ import annotations

import asyncio
import logging
import os
import threading
from pathlib import Path

from crewai.tools import BaseTool
from pydantic import PrivateAttr

logger = logging.getLogger(__name__)


# ─── Shared browser session ───────────────────────────────────────────────────

class BrowserSession:
    """
    Playwright browser managed in a dedicated background thread with its own
    event loop. This decouples Playwright's async requirements from whatever
    the calling thread is doing (sync pipeline, asyncio pipeline, etc.).

    run_sync() lets any thread dispatch coroutines into the Playwright loop
    and block until they complete — no event loop conflicts.
    """

    def __init__(self) -> None:
        self._loop: asyncio.AbstractEventLoop | None = None
        self._thread: threading.Thread | None = None
        self._pw = None
        self._browser = None
        self.page = None

    # ── Internal loop management ───────────────────────────────────────────

    def start(self, channel: str = "chrome") -> None:
        """Start the Playwright thread + open Chrome. Blocks until ready."""
        ready = threading.Event()

        def _run_loop() -> None:
            self._loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._loop)
            ready.set()
            self._loop.run_forever()

        self._thread = threading.Thread(target=_run_loop, daemon=True)
        self._thread.start()
        ready.wait()
        self.run_sync(self._init(channel))

    async def _init(self, channel: str) -> None:
        from playwright.async_api import async_playwright
        self._pw = await async_playwright().start()
        self._browser = await self._pw.chromium.launch(headless=False, channel=channel)
        self.page = await self._browser.new_page()
        await self.page.set_viewport_size({"width": 1280, "height": 900})

    def run_sync(self, coro) -> object:
        """Dispatch a coroutine to the Playwright thread and block for the result."""
        future = asyncio.run_coroutine_threadsafe(coro, self._loop)
        return future.result(timeout=60)

    def close(self) -> None:
        async def _close() -> None:
            try:
                if self._browser:
                    await self._browser.close()
                if self._pw:
                    await self._pw.stop()
            except Exception:
                pass

        if self._loop and self._loop.is_running():
            try:
                asyncio.run_coroutine_threadsafe(_close(), self._loop).result(timeout=10)
            except Exception:
                pass
            self._loop.call_soon_threadsafe(self._loop.stop)

        if self._thread:
            self._thread.join(timeout=5)


# ─── Page content summariser ──────────────────────────────────────────────────

async def _summarise(page, max_text: int = 400, max_links: int = 8, highlight_documents: bool = True) -> str:
    """Compact, token-efficient page summary for the LLM."""
    try:
        title = await page.title()
    except Exception:
        title = "Unknown"

    try:
        url = page.url
    except Exception:
        url = "Unknown"

    text: str = ""
    try:
        text = await page.evaluate("""() => {
        const walker = document.createTreeWalker(
            document.body, NodeFilter.SHOW_TEXT,
            { acceptNode: n => {
                const tag = n.parentElement?.tagName?.toLowerCase() ?? '';
                return ['script','style','noscript'].includes(tag)
                    ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
            }}
        );
        let t = '', node;
        while ((node = walker.nextNode()) && t.length < 3000)
            t += node.textContent + ' ';
        return t.replace(/\\s+/g, ' ').trim();
    }""")
    except Exception as e:
        logger.warning(f"Error extracting text: {e}")
        text = "(Could not extract page text)"

    all_links: list[dict] = []
    try:
        all_links = await page.eval_on_selector_all(
            "a[href]",
            r"""els => els
                .map(el => ({ href: el.href, text: el.innerText.trim().replace(/\s+/g,' ') }))
                .filter(l => l.href.startsWith('http') && l.text.length > 1 && l.text.length < 100)"""
        )
    except Exception as e:
        logger.warning(f"Error extracting links: {e}")
        all_links = []

    pdf_links = [l for l in all_links if ".pdf" in l["href"].lower()]

    # Identify financial document keywords for prioritization
    financial_keywords = ["itr", "dfp", "quarterly", "annual", "financial", "statement", "report", "results", "earnings"]
    doc_links = [
        l for l in all_links
        if ".pdf" not in l["href"].lower() and any(kw in l["text"].lower() for kw in financial_keywords)
    ]

    # Remaining navigation links
    nav_links = [l for l in all_links if ".pdf" not in l["href"].lower() and l not in doc_links][:max_links]

    doc_block = "\n".join(
        f"  [DOC-{i + 1}] \"{l['text']}\" — {l['href']}"
        for i, l in enumerate(doc_links[:max_links])
    )

    nav_block = "\n".join(
        f"  [{i + 1}] \"{l['text']}\" — {l['href']}"
        for i, l in enumerate(nav_links)
    )

    # Extract tables — all rows, all columns, labelled by quarter + column header
    tables_raw: list[str] = []
    try:
        tables_raw = await page.eval_on_selector_all(
            "table",
            r"""tables => tables.slice(0, 3).map(table => {
                const theadRows = Array.from(table.querySelectorAll('thead tr'));
                const dataRows  = Array.from(table.querySelectorAll('tbody tr'));
                if (!dataRows.length) return '';

                // Build column header map (colspan-aware)
                const colMap = [];
                if (theadRows[0]) {
                    Array.from(theadRows[0].querySelectorAll('th, td')).forEach(cell => {
                        const span = parseInt(cell.getAttribute('colspan') || '1');
                        const t = cell.innerText.trim().replace(/\s+/g, ' ');
                        for (let i = 0; i < span; i++) colMap.push(t || '');
                    });
                }
                // If there's a second header row (e.g. icon labels), prefer it
                if (theadRows[1]) {
                    Array.from(theadRows[1].querySelectorAll('th, td')).forEach((cell, i) => {
                        if (!colMap[i]) colMap[i] = '';
                        const img = cell.querySelector('img');
                        const label = cell.innerText.trim() || (img ? img.alt : '');
                        if (label) colMap[i] = colMap[i] ? colMap[i] + ' > ' + label : label;
                    });
                }

                // Emit one line per (row × column) that has a link
                const lines = [];
                dataRows.forEach(row => {
                    // Try to get the row label from first cell
                    const cells = Array.from(row.querySelectorAll('td'));
                    const rowLabel = cells[0] ? cells[0].innerText.trim().replace(/\s+/g, ' ') : '';
                    cells.forEach((cell, i) => {
                        const a = cell.querySelector('a[href]');
                        if (!a) return;
                        const colLabel = colMap[i] || `col${i}`;
                        const prefix = rowLabel ? `${rowLabel} | ${colLabel}` : colLabel;
                        lines.push(prefix + ': ' + a.href);
                    });
                });
                return lines.join('\n');
            }).filter(t => t && t.trim())"""
        )
    except Exception as e:
        logger.warning(f"Error extracting tables: {e}")
        tables_raw = []

    parts = [
        f"CURRENT PAGE\nTitle : {title}\nURL   : {url}\n",
        f"TEXT (first {max_text} chars):\n{text[:max_text]}",
    ]

    if doc_links:
        parts.append(f"📄 FINANCIAL DOCUMENTS ({len(doc_links)} found):\n{doc_block}")

    parts.append(f"NAVIGATION LINKS ({len(nav_links)} shown):\n{nav_block}")

    if pdf_links:
        pdf_block = "\n".join(
            f"  [PDF-{i + 1}] \"{l['text']}\" — {l['href']}"
            for i, l in enumerate(pdf_links[:8])
        )
        parts.append(f"PDF DOWNLOAD LINKS ({len(pdf_links[:8])} shown):\n{pdf_block}")

    if tables_raw:
        for i, t in enumerate(tables_raw):
            parts.append(f"TABLE {i + 1} (headers | row data with links):\n{t}")

    return "\n\n".join(parts)


# ─── CrewAI tools ─────────────────────────────────────────────────────────────

class GetPageContentTool(BaseTool):
    """Read the current browser page and return a compact summary."""

    name: str = "get_page_content"
    description: str = (
        "Read the current browser page. Returns the title, URL, visible text, "
        "and up to 10 clickable links. Call this first on any page before deciding "
        "where to navigate."
    )
    _session: BrowserSession = PrivateAttr()

    def __init__(self, session: BrowserSession, **kwargs):
        super().__init__(**kwargs)
        self._session = session

    def _run(self, argument: str = "") -> str:  # noqa: ARG002
        return self._session.run_sync(_summarise(self._session.page))


class NavigateToUrlTool(BaseTool):
    """Navigate the browser to a URL and return the new page content."""

    name: str = "navigate_to_url"
    description: str = (
        "Navigate the browser to a URL. "
        "Input: a complete URL starting with http:// or https://. "
        "Returns the new page content after navigation."
    )
    _session: BrowserSession = PrivateAttr()

    def __init__(self, session: BrowserSession, **kwargs):
        super().__init__(**kwargs)
        self._session = session

    def _run(self, url: str) -> str:
        async def _nav() -> str:
            await self._session.page.goto(url.strip(), wait_until="networkidle", timeout=30_000)
            # Wait for any JS-rendered table to appear before reading
            try:
                await self._session.page.wait_for_selector("table", timeout=8_000)
            except Exception:
                pass
            return await _summarise(self._session.page)

        return self._session.run_sync(_nav())


class ClickAndDownloadTool(BaseTool):
    """Click a download link on the current page and save the file."""

    name: str = "click_and_download"
    description: str = (
        "Click a download link on the current page to trigger a file download. "
        "Input: the href URL of the link to click, exactly as it appears in the page links. "
        "The browser will click the link and the file will be saved to the download folder."
    )
    _session: BrowserSession = PrivateAttr()
    _download_folder: str = PrivateAttr()

    def __init__(self, session: BrowserSession, download_folder: str, **kwargs):
        super().__init__(**kwargs)
        self._session = session
        self._download_folder = download_folder

    def _run(self, link_url: str) -> str:
        from urllib.parse import urljoin
        folder = self._download_folder
        href = link_url.strip()

        async def _do() -> str:
            Path(folder).mkdir(parents=True, exist_ok=True)
            page = self._session.page

            # Resolve the URL without navigating — use it directly
            pdf_url = href if href.startswith("http") else urljoin(page.url, href)

            # Force-download via JS anchor with the 'download' attribute.
            # This works whether the link would normally open in a new tab or same tab.
            async with page.context.expect_page(timeout=8_000) as new_page_info:
                await page.evaluate(
                    """(url) => {
                        const a = Object.assign(document.createElement('a'), {
                            href: url, target: '_blank', style: 'display:none'
                        });
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                    }""",
                    pdf_url,
                )

            new_page = None
            try:
                new_page = await new_page_info.value
                await new_page.wait_for_load_state("domcontentloaded", timeout=20_000)
                pdf_url = new_page.url
            except Exception:
                pass  # no new tab opened — pdf_url is still the original href

            target = new_page or page
            async with target.expect_download(timeout=60_000) as dl_info:
                await target.evaluate(
                    """(url) => {
                        const a = Object.assign(document.createElement('a'), {
                            href: url, download: '', style: 'display:none'
                        });
                        document.body.appendChild(a);
                        a.click();
                        a.remove();
                    }""",
                    pdf_url,
                )

            download = await dl_info.value
            filename = download.suggested_filename or pdf_url.split("/")[-1] or "document.pdf"
            save_path = os.path.join(folder, filename)
            await download.save_as(save_path)
            if new_page:
                await new_page.close()
            return f"✅ Saved: {filename} → {save_path}"

        return self._session.run_sync(_do())


# ─── Direct Financial Statement downloader ────────────────────────────────────

class DownloadFinancialStatementTool(BaseTool):
    """Navigate to an IR page and download the most recent Financial Statements PDF directly."""

    name: str = "download_financial_statement"
    description: str = (
        "Navigate to a company IR page, find the most recent available Financial Statements "
        "PDF link in the Results Center table using DOM extraction, and download it. "
        "Input: the IR URL to start from."
    )
    _session: BrowserSession = PrivateAttr()
    _download_folder: str = PrivateAttr()

    def __init__(self, session: BrowserSession, download_folder: str, **kwargs):
        super().__init__(**kwargs)
        self._session = session
        self._download_folder = download_folder

    def _run(self, ir_url: str) -> str:
        return self._session.run_sync(self._do(ir_url.strip()))

    async def _do(self, ir_url: str) -> str:
        import httpx
        page = self._session.page
        Path(self._download_folder).mkdir(parents=True, exist_ok=True)

        await page.goto(ir_url, wait_until="networkidle", timeout=30_000)
        try:
            await page.wait_for_selector("table", timeout=10_000)
        except Exception:
            pass

        fs_url = await self._find_fs_link(page)

        # If not on the results page yet, find and follow a Results Center link
        if not fs_url:
            results_href = await page.evaluate("""() => {
                const a = Array.from(document.querySelectorAll('a[href]')).find(el => {
                    const t = el.innerText.trim().toLowerCase();
                    return t.includes('result') || t.includes('resultado') || t.includes('quarterly');
                });
                return a ? a.href : null;
            }""")
            if results_href:
                await page.goto(results_href, wait_until="networkidle", timeout=30_000)
                try:
                    await page.wait_for_selector("table", timeout=10_000)
                except Exception:
                    pass
                fs_url = await self._find_fs_link(page)

        if not fs_url:
            return "❌ Could not find an active Financial Statements link on the Results Center page."

        # Download using httpx — carries browser session cookies for authenticated CDN URLs
        browser_cookies = await page.context.cookies()
        headers = {
            "Cookie": "; ".join(f"{c['name']}={c['value']}" for c in browser_cookies),
            "Referer": page.url,
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            ),
        }
        async with httpx.AsyncClient(follow_redirects=True, timeout=60) as client:
            response = await client.get(fs_url, headers=headers)
            response.raise_for_status()

        content_disp = response.headers.get("content-disposition", "")
        if "filename=" in content_disp:
            filename = content_disp.split("filename=")[-1].strip('"; ')
        else:
            filename = fs_url.split("/")[-1].split("?")[0] or "document.pdf"
        if not filename.lower().endswith(".pdf"):
            filename += ".pdf"

        save_path = os.path.join(self._download_folder, filename)
        Path(save_path).write_bytes(response.content)
        return f"✅ Saved: {filename} → {save_path}"

    async def _find_fs_link(self, page) -> str | None:
        """Return the first active Financial Statements link found across all tables."""
        return await page.evaluate("""() => {
            for (const table of document.querySelectorAll('table')) {
                const headers = Array.from(table.querySelectorAll('thead th, thead td'));
                let fsIdx = -1;
                headers.forEach((h, i) => {
                    const t = h.innerText.trim().toUpperCase();
                    if (t.includes('FINANCIAL') || t === 'ITR' || t === 'DFP')
                        fsIdx = i;
                });
                if (fsIdx < 0) continue;
                for (const row of table.querySelectorAll('tbody tr')) {
                    const cells = Array.from(row.querySelectorAll('td'));
                    const link = cells[fsIdx]?.querySelector('a[href]');
                    if (link?.href) return link.href;
                }
            }
            return null;
        }""")
