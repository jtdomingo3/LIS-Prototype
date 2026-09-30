"""
Web Search module for Gezyne LIS RAG Service
Fetches top search snippets via DuckDuckGo without scraping full HTML pages
to maintain low latency and conserve token usage. All results are labeled as "Web Result".
"""

import os
from typing import List, Dict, Any

try:
    from ddgs import DDGS
except ImportError:
    try:
        from duckduckgo_search import DDGS
    except ImportError:
        DDGS = None


def is_web_search_available() -> bool:
    """Check if web search library (ddgs) is installed and available"""
    return DDGS is not None


def search_web(query: str, max_results: int = 3, timeout_seconds: int = 6) -> List[Dict[str, Any]]:
    """
    Perform lightweight web search and return structured snippets.
    Returns: List of {"title": str, "url": str, "snippet": str, "source": "Web Result"}
    """
    if not query or not query.strip():
        return []

    if DDGS is None:
        print("[WebSearch] WARNING: Neither 'ddgs' nor 'duckduckgo-search' is installed in this Python environment.")
        print("[WebSearch] To enable web search, run: pip install ddgs")
        return []

    clean_query = query.strip()
    results = []

    try:
        ddgs_client = DDGS(timeout=timeout_seconds)
        raw_results = list(ddgs_client.text(clean_query, max_results=max_results))
        for item in raw_results:
            title = item.get("title", "").strip()
            url = item.get("href", "").strip()
            snippet = item.get("body", "").strip()
            if title and url:
                results.append({
                    "title": title,
                    "url": url,
                    "snippet": snippet,
                    "source": "Web Result"
                })
        if results:
            return results[:max_results]
    except Exception as e:
        print(f"[WebSearch] Search error for '{clean_query}': {e}")

    return results


def format_web_snippets_context(web_results: List[Dict[str, Any]]) -> str:
    """Format web search snippets for injection into the LLM prompt"""
    if not web_results:
        return ""

    lines = [
        "\n### LIVE WEB SEARCH REFERENCES (EXTERNAL CONTEXT):",
        "*Note: External web search results are provided for general reference. If there is any discrepancy with internal laboratory SOPs, always prioritize local laboratory SOPs.*",
        ""
    ]
    for idx, r in enumerate(web_results, start=1):
        lines.append(f"[{idx}] {r.get('title', 'Web Result')}")
        lines.append(f"URL: {r.get('url', '')}")
        lines.append(f"Snippet: {r.get('snippet', '')}")
        lines.append("")

    return "\n".join(lines)
