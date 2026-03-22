"""Google Web Search extraction profile.

Extracts structured results from rendered Google search HTML.

Extraction strategy modeled on SearXNG's google.py engine:
- Container-first: iterate ``div.MjjYud`` result blocks
- Snippet via ``data-sncf="1"`` data attribute (Google-internal marker)
- Fallback to ``div.VwiC3b`` class for snippets
- Title via ``a[h3]/h3`` anchor pattern (most robust)
- URL de-tracking (strips Google redirect wrappers)
- Targeted script removal only inside snippet nodes
- Suggestion parsing from "People also search for" section
- CAPTCHA detection (sorry.google.com, consent.google.com)
"""

import logging
import re

from lxml import html as lxml_html

logger = logging.getLogger(__name__)

CAPTCHA_PATTERNS = ["/sorry", "consent.google", "recaptcha"]
WAIT_FOR_SELECTOR = "a h3"
WAIT_AFTER_LOAD = 2

# Google sometimes wraps URLs in /url?q=<actual_url>&...
RE_GOOGLE_REDIRECT = re.compile(r"/url\?q=([^&]+)")


def extract(page_html: str, page_url: str, **kwargs) -> dict:
    """Extract search results from rendered Google HTML."""
    results = []
    suggestions = []

    dom = lxml_html.fromstring(page_html)

    # Find result containers (MjjYud divs inside the results area)
    containers = dom.xpath('//div[@id="rso"]//div[contains(@class, "MjjYud")]')

    if not containers:
        # Fallback: try without #rso constraint
        containers = dom.xpath('//div[contains(@class, "MjjYud")]')

    seen_urls = set()

    for container in containers:
        try:
            result = _extract_result(container)
            if result is None:
                continue

            url = result["url"]
            if url in seen_urls:
                continue
            seen_urls.add(url)

            results.append(result)

        except Exception as exc:
            logger.debug("Error parsing Google result: %s", exc)
            continue

    # Parse suggestions — "People also search for" section
    for node in dom.xpath('//div[contains(@class, "oIk2Cb")]//a'):
        text = _extract_text(node)
        if text:
            suggestions.append(text)

    # Fallback suggestion selector (older layout)
    if not suggestions:
        for node in dom.xpath('//div[contains(@class, "ouy7Mc")]//a'):
            text = _extract_text(node)
            if text:
                suggestions.append(text)

    return {"results": results, "suggestions": suggestions}


def _extract_result(container):
    """Extract a single result from a MjjYud container div.

    Returns a dict with url, title, content, thumbnail or None if not a
    valid organic result.
    """
    # --- Title + URL ---
    # Find <a> tags that contain an <h3> (the result title link)
    h3_nodes = container.xpath('.//a[h3]/h3')
    if not h3_nodes:
        return None

    h3 = h3_nodes[0]
    title = _extract_text(h3)
    if not title:
        return None

    link_node = h3.getparent()
    if link_node is None:
        return None

    url = link_node.get("href", "")
    url = _clean_google_url(url)

    if not url or not url.startswith("http"):
        return None

    # --- Snippet / Content ---
    content = _extract_snippet(container)

    # --- Thumbnail ---
    thumbnail = _extract_thumbnail(container)

    result = {
        "url": url,
        "title": title,
        "content": content,
    }
    if thumbnail:
        result["thumbnail"] = thumbnail

    return result


def _extract_snippet(container):
    """Extract snippet text from a result container.

    Strategy (in priority order):
    1. data-sncf="1" attribute — Google's internal snippet marker
       (same approach as SearXNG's google.py engine)
    2. div.VwiC3b — the CSS class Google currently uses for snippets
    3. Empty string if nothing found
    """
    # Strategy 1: data-sncf attribute (most resilient)
    snippet_nodes = container.xpath('.//div[contains(@data-sncf, "1")]')
    if snippet_nodes:
        return _extract_text_clean(snippet_nodes[0])

    # Strategy 2: data-snf="nke7rc" slot marker
    snippet_nodes = container.xpath('.//div[@data-snf="nke7rc"]')
    if snippet_nodes:
        return _extract_text_clean(snippet_nodes[0])

    # Strategy 3: VwiC3b class (current Google snippet class)
    snippet_nodes = container.xpath('.//div[contains(@class, "VwiC3b")]')
    if snippet_nodes:
        return _extract_text_clean(snippet_nodes[0])

    return ""


def _extract_text_clean(node):
    """Extract text from a node, removing script tags first.

    Uses lxml.html.tostring with method='text' for robust extraction
    (same approach as SearXNG's extract_text utility).
    """
    if node is None:
        return ""

    # Remove script tags inside the node (targeted, not global)
    for script in node.xpath(".//script"):
        parent = script.getparent()
        if parent is not None:
            parent.remove(script)

    return _extract_text(node)


def _extract_text(node):
    """Extract and normalize text from an lxml node.

    Uses tostring(method='text') which is more robust than text_content():
    - with_tail=False avoids grabbing sibling text
    - Normalizes whitespace (collapses multiple spaces, strips newlines)
    """
    if node is None:
        return ""

    if hasattr(node, "tag"):
        text = lxml_html.tostring(
            node, encoding="unicode", method="text", with_tail=False
        )
    elif hasattr(node, "text_content"):
        text = node.text_content()
    else:
        text = str(node)

    # Normalize whitespace
    text = text.strip().replace("\n", " ")
    text = " ".join(text.split())
    return text


def _extract_thumbnail(container):
    """Extract thumbnail URL from a result, excluding favicons."""
    # Find images that are NOT the favicon (XNo5Ab class)
    imgs = container.xpath('.//img[not(contains(@class, "XNo5Ab"))]')
    for img in imgs:
        src = img.get("src", "")
        # Skip tiny tracking pixels and data URIs that are favicons
        if src and src.startswith("http"):
            return src
        # Also accept base64 data URIs if they're reasonably large
        if src and src.startswith("data:image") and len(src) > 200:
            return src
    return ""


def _clean_google_url(url: str) -> str:
    """Strip Google's /url?q= redirect wrapper if present."""
    match = RE_GOOGLE_REDIRECT.match(url)
    if match:
        from urllib.parse import unquote
        return unquote(match.group(1))
    return url
