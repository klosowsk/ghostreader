"""
GhostReader Scraper Service

Anti-detect browser rendering service using Camoufox (stealth Firefox fork).
Returns raw HTML for processing by the GhostReader processor.

All Camoufox parameters are configurable via environment variables.

Endpoints:

POST /scrape
  Body: {"url": "https://...", "wait_after_load": 2, "timeout": 15000}
  Returns: {"html": "...", "status": 200, "url": "..."}
  Returns: {"results": [...], "suggestions": [...], "captcha": false, "error": null}

GET /render/{url}
  Jina-style URL rendering. Returns markdown by default.
  Query params: ?format=markdown|html|json  &wait=2
  Example: GET /render/https://example.com
  Example: GET /render/https://example.com?format=html&wait=3

GET /health
  Returns: {"status": "ok"}

GET /config
  Returns: current configuration (for debugging)

Environment Variables:

  CAMOUFOX_HEADLESS       - Headless mode: "virtual" (default), "true", "false"
  CAMOUFOX_OS             - Claimed OS for fingerprint: "linux" (default), "windows", "macos"
  CAMOUFOX_GEOIP          - Auto-match timezone/locale/WebRTC to IP: "true" (default)
  CAMOUFOX_HUMANIZE       - Natural cursor movement: "true" (default)
  CAMOUFOX_ENABLE_CACHE   - HTTP/back-forward cache: "true" (default)
  CAMOUFOX_BLOCK_WEBRTC   - Block WebRTC entirely: "false" (default, let Camoufox spoof)
  CAMOUFOX_BLOCK_WEBGL    - Block WebGL: "false" (default)
  CAMOUFOX_BLOCK_IMAGES   - Block image loading: "false" (default)
  CAMOUFOX_PERSISTENT     - Enable persistent context + fingerprint pinning: "true" (default)
  CAMOUFOX_USER_DATA_DIR  - Profile directory: "/userdata/profile" (default)
  CAMOUFOX_FINGERPRINT_PATH - Pinned fingerprint file: "/userdata/fingerprint.json" (default)
  CAMOUFOX_LOCALE         - Override locale (empty = let geoip decide, or "en-US")
  CAMOUFOX_PROXY          - Proxy URL: "" (default, no proxy)
                            Format: "socks5://user:pass@host:port" or "http://host:port"
  CAMOUFOX_SCREEN_WIDTH   - Screen width for fingerprint: 1920 (default)
  CAMOUFOX_SCREEN_HEIGHT  - Screen height for fingerprint: 1080 (default)
  PORT                    - Server port: 8080 (default)
"""

import asyncio
import hashlib
import json
import logging
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

from aiohttp import web

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("ghostreader-scraper")


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

def _env_bool(key, default="false"):
    """Read a boolean from an environment variable."""
    return os.environ.get(key, default).lower() in ("true", "1", "yes")


def _env_int(key, default=0):
    """Read an integer from an environment variable."""
    try:
        return int(os.environ.get(key, str(default)))
    except (ValueError, TypeError):
        return default


def _env_str(key, default=""):
    """Read a string from an environment variable."""
    return os.environ.get(key, default)


def load_config():
    """Load configuration from environment variables.

    Returns a dict with all Camoufox settings, typed appropriately.
    Every setting has a sensible default so the image works out of the box.
    """
    headless = _env_str("CAMOUFOX_HEADLESS", "virtual")
    if headless == "true":
        headless = True
    elif headless == "false":
        headless = False
    # else keep as string (e.g. "virtual")

    proxy_url = _env_str("CAMOUFOX_PROXY", "")
    proxy = None
    if proxy_url:
        proxy = _parse_proxy(proxy_url)

    locale_val = _env_str("CAMOUFOX_LOCALE", "")
    # When geoip is enabled and no locale override, let Camoufox auto-detect.
    # When geoip is disabled and no locale override, fall back to en-US.
    geoip = _env_bool("CAMOUFOX_GEOIP", "true")
    if not locale_val and not geoip:
        locale_val = "en-US"

    return {
        "headless": headless,
        "os": _env_str("CAMOUFOX_OS", "linux"),
        "geoip": geoip,
        "humanize": _env_bool("CAMOUFOX_HUMANIZE", "true"),
        "enable_cache": _env_bool("CAMOUFOX_ENABLE_CACHE", "true"),
        "block_webrtc": _env_bool("CAMOUFOX_BLOCK_WEBRTC", "false"),
        "block_webgl": _env_bool("CAMOUFOX_BLOCK_WEBGL", "false"),
        "block_images": _env_bool("CAMOUFOX_BLOCK_IMAGES", "false"),
        "persistent": _env_bool("CAMOUFOX_PERSISTENT", "true"),
        "user_data_dir": _env_str("CAMOUFOX_USER_DATA_DIR", "/userdata/profile"),
        "fingerprint_path": _env_str("CAMOUFOX_FINGERPRINT_PATH", "/userdata/fingerprint.json"),
        "locale": locale_val or None,  # None = let geoip/camoufox decide
        "proxy": proxy,
        "proxy_url_raw": proxy_url,
        "screen_width": _env_int("CAMOUFOX_SCREEN_WIDTH", 1920),
        "screen_height": _env_int("CAMOUFOX_SCREEN_HEIGHT", 1080),
    }


def _parse_proxy(proxy_url):
    """Parse a proxy URL into the dict format Camoufox/Playwright expects.

    Accepts: "http://host:port", "socks5://user:pass@host:port", etc.
    Returns: {"server": "...", "username": "...", "password": "..."}
    """
    parsed = urlparse(proxy_url)
    result = {"server": f"{parsed.scheme}://{parsed.hostname}:{parsed.port}"}
    if parsed.username:
        result["username"] = parsed.username
    if parsed.password:
        result["password"] = parsed.password
    return result


# ---------------------------------------------------------------------------
# Fingerprint persistence
# ---------------------------------------------------------------------------

def _proxy_hash(proxy_url):
    """Hash the proxy URL to detect changes (triggers fingerprint regen)."""
    return hashlib.sha256(proxy_url.encode()).hexdigest()[:16] if proxy_url else "no-proxy"


def _load_fingerprint(config):
    """Load a pinned fingerprint from disk, or generate and save a new one.

    If the proxy has changed since the fingerprint was generated, regenerate
    to maintain GeoIP consistency.

    Returns a BrowserForge Fingerprint object.
    """
    fp_path = Path(config["fingerprint_path"])
    current_proxy_hash = _proxy_hash(config["proxy_url_raw"])

    # Try to load existing fingerprint
    if fp_path.exists():
        try:
            saved = json.loads(fp_path.read_text())
            saved_proxy_hash = saved.get("_proxy_hash", "")

            if saved_proxy_hash == current_proxy_hash:
                logger.info(
                    "Loaded pinned fingerprint from %s (proxy_hash=%s)",
                    fp_path, current_proxy_hash,
                )
                # Remove our metadata before passing to Camoufox
                fp_data = {k: v for k, v in saved.items() if not k.startswith("_")}
                return _dict_to_fingerprint(fp_data)

            logger.warning(
                "Proxy changed (was=%s, now=%s) — regenerating fingerprint",
                saved_proxy_hash, current_proxy_hash,
            )
        except (json.JSONDecodeError, KeyError) as exc:
            logger.warning("Failed to load fingerprint from %s: %s", fp_path, exc)

    # Generate new fingerprint
    fingerprint = _generate_fingerprint(config)

    # Save to disk with proxy hash metadata
    fp_path.parent.mkdir(parents=True, exist_ok=True)
    fp_dict = _fingerprint_to_dict(fingerprint)
    fp_dict["_proxy_hash"] = current_proxy_hash
    fp_path.write_text(json.dumps(fp_dict, indent=2))
    logger.info("Generated and saved new fingerprint to %s", fp_path)

    return fingerprint


def _generate_fingerprint(config):
    """Generate a new BrowserForge fingerprint matching our config."""
    from browserforge.fingerprints import FingerprintGenerator, Screen

    screen = Screen(
        min_width=config["screen_width"],
        max_width=config["screen_width"],
        min_height=config["screen_height"],
        max_height=config["screen_height"],
    )
    generator = FingerprintGenerator(
        browser="firefox",
        os=(config["os"],),
    )
    return generator.generate(screen=screen)


def _fingerprint_to_dict(fingerprint):
    """Serialize a BrowserForge Fingerprint to a JSON-safe dict.

    Uses the built-in dumps() method which handles all nested types correctly.
    """
    return json.loads(fingerprint.dumps())


def _dict_to_fingerprint(fp_data):
    """Reconstruct a BrowserForge Fingerprint from a saved dict.

    BrowserForge's Fingerprint expects typed nested objects (ScreenFingerprint,
    NavigatorFingerprint, VideoCard), not plain dicts.
    """
    from browserforge.fingerprints import Fingerprint
    from browserforge.fingerprints.generator import (
        ScreenFingerprint,
        NavigatorFingerprint,
        VideoCard,
    )

    return Fingerprint(
        screen=ScreenFingerprint(**fp_data["screen"]),
        navigator=NavigatorFingerprint(**fp_data["navigator"]),
        headers=fp_data["headers"],
        videoCodecs=fp_data["videoCodecs"],
        audioCodecs=fp_data["audioCodecs"],
        pluginsData=fp_data["pluginsData"],
        battery=fp_data.get("battery"),
        videoCard=VideoCard(**fp_data["videoCard"]) if fp_data.get("videoCard") else None,
        multimediaDevices=fp_data["multimediaDevices"],
        fonts=fp_data["fonts"],
        mockWebRTC=fp_data.get("mockWebRTC"),
        slim=fp_data.get("slim"),
    )


# ---------------------------------------------------------------------------
# Browser lifecycle
# ---------------------------------------------------------------------------

# Global browser context (reused across requests)
_context = None
_playwright = None
_context_lock = asyncio.Lock()
_config = None


async def get_browser():
    """Get or create a shared Camoufox browser context.

    In persistent mode, returns a BrowserContext with pinned fingerprint
    and persistent profile data (cookies, cache, history).

    In stateless mode, returns a Browser with a fresh random fingerprint
    (backwards-compatible with the original behavior).
    """
    global _context, _playwright, _config

    async with _context_lock:
        if _config is None:
            _config = load_config()
            _log_config(_config)

        if _context is not None:
            # Browser has is_connected(), BrowserContext does not.
            # For BrowserContext, check if pages can still be created (it's alive
            # as long as we haven't explicitly closed it).
            if hasattr(_context, "is_connected"):
                if _context.is_connected():
                    return _context
            else:
                # BrowserContext (persistent mode) — assume alive if not None.
                # It gets set to None on shutdown.
                return _context

        if _config["persistent"]:
            _context, _playwright = await _launch_persistent(_config)
        else:
            _context = await _launch_stateless(_config)

        return _context


async def _launch_persistent(config):
    """Launch Camoufox with persistent context and pinned fingerprint.

    Returns (BrowserContext, playwright_instance).
    """
    from playwright.async_api import async_playwright
    from camoufox.async_api import AsyncNewBrowser

    logger.info("Launching Camoufox in PERSISTENT mode...")

    # Ensure profile directory exists
    Path(config["user_data_dir"]).mkdir(parents=True, exist_ok=True)

    # Load or generate pinned fingerprint
    fingerprint = _load_fingerprint(config)

    # Start Playwright
    pw = await async_playwright().start()

    # Build launch kwargs
    kwargs = {
        "persistent_context": True,
        "user_data_dir": config["user_data_dir"],
        "fingerprint": fingerprint,
        "i_know_what_im_doing": True,
        "headless": config["headless"],
        "os": config["os"],
        "humanize": config["humanize"],
        "enable_cache": config["enable_cache"],
        "block_webrtc": config["block_webrtc"],
        "block_webgl": config["block_webgl"],
        "block_images": config["block_images"],
        "geoip": config["geoip"],
    }

    if config["proxy"]:
        kwargs["proxy"] = config["proxy"]

    if config["locale"]:
        kwargs["locale"] = config["locale"]

    context = await AsyncNewBrowser(pw, **kwargs)
    logger.info("Camoufox launched (persistent, user_data_dir=%s)", config["user_data_dir"])
    return context, pw


async def _launch_stateless(config):
    """Launch Camoufox in stateless mode (fresh fingerprint each time).

    Returns a Browser instance (original behavior).
    """
    from camoufox.async_api import AsyncCamoufox

    logger.info("Launching Camoufox in STATELESS mode...")

    kwargs = {
        "headless": config["headless"],
        "os": config["os"],
        "humanize": config["humanize"],
        "block_webrtc": config["block_webrtc"],
        "block_webgl": config["block_webgl"],
        "block_images": config["block_images"],
        "geoip": config["geoip"],
    }

    if config["proxy"]:
        kwargs["proxy"] = config["proxy"]

    if config["locale"]:
        kwargs["locale"] = config["locale"]

    ctx_manager = AsyncCamoufox(**kwargs)
    browser = await ctx_manager.__aenter__()
    # Store the context manager for cleanup
    browser._ctx_manager = ctx_manager
    logger.info("Camoufox launched (stateless)")
    return browser


def _log_config(config):
    """Log the active configuration at startup."""
    # Don't log proxy credentials
    safe_config = {k: v for k, v in config.items() if k != "proxy"}
    if config["proxy"]:
        safe_config["proxy"] = config["proxy"]["server"]
    logger.info("Configuration: %s", json.dumps(safe_config, default=str))


# ---------------------------------------------------------------------------
# Page rendering
# ---------------------------------------------------------------------------

async def render_page(url, wait_after_load=2.0, timeout=15000, headers=None,
                       wait_for_selector=None, wait_until="domcontentloaded"):
    """Render a page in the browser and return (html, status_code, final_url).

    This is the shared rendering logic used by both /scrape and /extract.
    """
    browser = await get_browser()
    page = await browser.new_page()

    try:
        if headers:
            await page.set_extra_http_headers(headers)

        response = await page.goto(url, wait_until=wait_until, timeout=timeout)

        if wait_for_selector:
            try:
                await page.wait_for_selector(
                    wait_for_selector,
                    timeout=min(timeout, 10000),
                )
            except Exception:
                logger.warning("Selector %s not found, continuing...", wait_for_selector)

        if wait_after_load > 0:
            await page.wait_for_timeout(int(wait_after_load * 1000))

        page_html = await page.content()
        status_code = response.status if response else 0
        final_url = page.url

        return page_html, status_code, final_url

    finally:
        await page.close()


# ---------------------------------------------------------------------------
# HTTP handlers
# ---------------------------------------------------------------------------

async def handle_scrape(request: web.Request) -> web.Response:
    """Handle a scrape request. Renders a URL and returns JSON.

    Returns ``{"html": "...", "status": 200, "url": "..."}``.
    """
    try:
        body = await request.json()
    except json.JSONDecodeError:
        return web.json_response({"error": "Invalid JSON body"}, status=400)

    url = body.get("url")
    if not url:
        return web.json_response({"error": "Missing 'url' field"}, status=400)

    logger.info("Scraping: %s", url)

    try:
        page_html, status_code, final_url = await render_page(
            url=url,
            wait_after_load=body.get("wait_after_load", 2),
            timeout=body.get("timeout", 15000),
            headers=body.get("headers"),
            wait_for_selector=body.get("wait_for_selector"),
            wait_until=body.get("wait_until", "domcontentloaded"),
        )

        logger.info("Scraped %s -> %d (%d bytes)", url, status_code, len(page_html))

        return web.json_response({
            "html": page_html,
            "status": status_code,
            "url": final_url,
        })

    except Exception as e:
        logger.error("Error scraping %s: %s", url, e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_render(request: web.Request) -> web.Response:
    """GET endpoint. Renders a URL and returns raw HTML.

    The target URL is everything after ``/render/`` in the path.
    Query params:
      - ``wait``: seconds to wait after page load (default: 2)

    Examples::

        GET /render/https://example.com
        GET /render/https://example.com?wait=3
    """
    target_url = request.match_info.get("url", "")
    if not target_url:
        return web.json_response({"error": "Missing URL after /render/"}, status=400)

    raw_query = request.query_string
    wait_after_load = 2.0

    if raw_query:
        from urllib.parse import parse_qs, urlencode

        params = parse_qs(raw_query, keep_blank_values=True)

        if "wait" in params:
            try:
                wait_after_load = float(params.pop("wait")[0])
            except (ValueError, IndexError):
                pass

        remaining = urlencode(
            [(k, v) for k, vals in params.items() for v in vals]
        )
        if remaining:
            sep = "&" if "?" in target_url else "?"
            target_url = f"{target_url}{sep}{remaining}"

    logger.info("Render: %s (wait=%.1f)", target_url, wait_after_load)

    try:
        page_html, status_code, final_url = await render_page(
            url=target_url,
            wait_after_load=wait_after_load,
        )

        logger.info("Rendered %s -> %d (%d bytes)", target_url, status_code, len(page_html))

        return web.Response(
            text=page_html,
            content_type="text/html",
            charset="utf-8",
        )

    except Exception as e:
        logger.error("Error rendering %s: %s", target_url, e)
        return web.json_response({"error": str(e)}, status=500)


async def handle_health(request: web.Request) -> web.Response:
    """Health check endpoint."""
    return web.json_response({"status": "ok"})


async def handle_config(request: web.Request) -> web.Response:
    """Return current configuration (for debugging)."""
    config = load_config()
    # Redact proxy credentials
    safe = {k: v for k, v in config.items() if k not in ("proxy", "proxy_url_raw")}
    if config["proxy"]:
        safe["proxy"] = config["proxy"]["server"]
    else:
        safe["proxy"] = None
    return web.json_response(safe, dumps=lambda obj: json.dumps(obj, default=str))


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------

async def on_shutdown(app: web.Application):
    """Clean up browser on shutdown."""
    global _context, _playwright

    if _context is not None:
        logger.info("Shutting down Camoufox browser...")
        try:
            if _config and _config["persistent"]:
                # Persistent mode: close context, then stop Playwright
                await _context.close()
                if _playwright:
                    await _playwright.stop()
            else:
                # Stateless mode: exit the AsyncCamoufox context manager
                await _context._ctx_manager.__aexit__(None, None, None)
        except Exception as exc:
            logger.warning("Error during shutdown: %s", exc)
        _context = None
        _playwright = None


def create_app() -> web.Application:
    """Create the aiohttp application."""
    app = web.Application()
    app.router.add_post("/scrape", handle_scrape)
    app.router.add_get("/render/{url:.*}", handle_render)
    app.router.add_get("/health", handle_health)
    app.router.add_get("/config", handle_config)
    app.on_shutdown.append(on_shutdown)
    return app


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app = create_app()
    logger.info("Starting GhostReader Scraper on port %d", port)
    web.run_app(app, host="0.0.0.0", port=port)
