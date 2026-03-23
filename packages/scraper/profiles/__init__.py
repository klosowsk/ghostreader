"""Extraction profiles for the GhostReader scraper.

Each profile is a Python module that knows how to extract structured search
results from a specific vendor's rendered HTML.  Profiles are loaded
dynamically by name via :func:`load_profile`.

A profile module must implement:

    CAPTCHA_PATTERNS: list[str]
        URL substrings that indicate a CAPTCHA/block page.

    WAIT_FOR_SELECTOR: str | None
        CSS selector to wait for before extracting HTML (optional).

    WAIT_AFTER_LOAD: int
        Seconds to wait after page load.

    def extract(page_html: str, page_url: str) -> dict:
        Returns {"results": [...], "suggestions": [...]}
"""

import importlib
import logging

logger = logging.getLogger(__name__)

_profile_cache: dict = {}


def load_profile(name: str):
    """Load a profile module by name.  Returns None if not found."""
    if name in _profile_cache:
        return _profile_cache[name]

    try:
        module = importlib.import_module(f".{name}", package="profiles")
        _profile_cache[name] = module
        logger.info("Loaded extraction profile: %s", name)
        return module
    except ImportError:
        logger.error("Profile not found: %s", name)
        return None
