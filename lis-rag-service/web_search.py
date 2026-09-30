"""
Web Search module for Gezyne LIS RAG Service
Fetches top search snippets via DuckDuckGo (ddgs) or optional Google Custom Search
without scraping full HTML pages to preserve token limits and maintain low latency.
"""

import os
import urllib.parse
import urllib.request
import json
from typing import List, Dict, Any

try:
    from ddgs import DDGS
except ImportError:
    try:
        from duckduckgo_search import DDGS
    except ImportError:
        DDGS = None


def search_web(query: str, max_results: int = 3, timeout_seconds: int = 4) -> List[Dict[str, Any]]:
    """
    Perform lightweight web search and return structured snippets.
    Returns: List of {"title": str, "url": str, "snippet": str, "source": str}
    """
    if not query or not query.strip():
        return []

    clean_query = query.strip()
    results = []

    # 1. First check if Google Custom Search API credentials are provided in env
    google_api_key = os.getenv("GOOGLE_SEARCH_API_KEY", "").strip()
    google_cx = os.getenv("GOOGLE_SEARCH_CX", "").strip()

    if google_api_key and google_cx:
        try:
            results = _search_google_custom(clean_query, google_api_key, google_cx, max_results, timeout_seconds)
            if results:
                return results
        except Exception as e:
            print(f"[WebSearch] Google Custom Search failed ({e}), falling back to DuckDuckGo...")

    # 2. Free DuckDuckGo Search (no API key required)
    if DDGS is not None:
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
                        "source": "DuckDuckGo"
                    })
            if results:
                return results[:max_results]
        except Exception as e:
            print(f"[WebSearch] DuckDuckGo query error: {e}")

    return results


def _search_google_custom(query: str, api_key: str, cx: str, max_results: int = 3, timeout: int = 4) -> List[Dict[str, Any]]:
    """Query official Google Custom Search JSON API"""
    encoded_q = urllib.parse.quote(query)
    api_url = f"https://www.googleapis.com/customsearch/v1?key={api_key}&cx={cx}&q={encoded_q}&num={max_results}"

    req = urllib.request.Request(
        api_url,
        headers={"User-Agent": "Gezyne-LIS-RAG/1.0"}
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        if response.status == 200:
            data = json.loads(response.read().decode("utf-8"))
            items = data.get("items", [])
            out = []
            for it in items:
                out.append({
                    "title": it.get("title", ""),
                    "url": it.get("link", ""),
                    "snippet": it.get("snippet", ""),
                    "source": "Google"
                })
            return out
    return []


def format_web_snippets_context(web_results: List[Dict[str, Any]]) -> str:
    """Format web search snippets for injection into the LLM system prompt"""
    if not web_results:
        return ""

    lines = [
        "\n### LIVE WEB SEARCH REFERENCES (EXTERNAL CONTEXT):",
        "*Note: External web search results are provided for general reference. If there is a discrepancy with internal laboratory SOPs, prioritize local laboratory SOPs.*",
        ""
    ]
    for idx, r in enumerate(web_results, start=1):
        lines.append(f"[{idx}] {r.get('title', 'Web Result')}")
        lines.append(f"URL: {r.get('url', '')}")
        lines.append(f"Snippet: {r.get('snippet', '')}")
        lines.append("")

    return "\n".join(lines)
