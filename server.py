"""
Camoufox Scraper HTTP Service

A lightweight HTTP service that renders web pages using Camoufox (anti-detect browser)
and returns the rendered HTML. Designed to be used as a backend for SearXNG custom engines.

POST /scrape
  Body: {"url": "https://...", "wait_after_load": 2, "timeout": 15000}
  Returns: {"html": "...", "status": 200, "url": "..."}

GET /health
  Returns: {"status": "ok"}
"""

import asyncio
import json
import logging
import os
import signal
import sys
from typing import Optional

from aiohttp import web

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("camoufox-scraper")

# Global browser instance (reused across requests)
_browser = None
_browser_lock = asyncio.Lock()


async def get_browser():
    """Get or create a shared Camoufox browser instance."""
    global _browser

    async with _browser_lock:
        if _browser is None or not _browser.is_connected():
            logger.info("Launching Camoufox browser...")
            from camoufox.async_api import AsyncCamoufox

            # Use virtual display (Xvfb) for headless operation
            headless_mode = os.environ.get("CAMOUFOX_HEADLESS", "virtual")
            if headless_mode == "true":
                headless_mode = True

            ctx_manager = AsyncCamoufox(
                headless=headless_mode,
                block_images=True,
                block_webrtc=True,
                block_webgl=True,
                os="windows",
                locale="en-US",
            )
            _browser = await ctx_manager.__aenter__()
            # Store the context manager so we can clean up later
            _browser._ctx_manager = ctx_manager
            logger.info("Camoufox browser launched successfully")

        return _browser


async def handle_scrape(request: web.Request) -> web.Response:
    """Handle a scrape request. Renders a URL and returns the HTML."""
    try:
        body = await request.json()
    except json.JSONDecodeError:
        return web.json_response(
            {"error": "Invalid JSON body"}, status=400
        )

    url = body.get("url")
    if not url:
        return web.json_response(
            {"error": "Missing 'url' field"}, status=400
        )

    wait_after_load = body.get("wait_after_load", 2)
    timeout = body.get("timeout", 15000)
    headers = body.get("headers", {})
    wait_for_selector = body.get("wait_for_selector", None)

    logger.info(f"Scraping: {url}")

    try:
        browser = await get_browser()
        page = await browser.new_page()

        try:
            # Set extra headers if provided
            if headers:
                await page.set_extra_http_headers(headers)

            # Navigate to the URL
            response = await page.goto(
                url,
                wait_until="networkidle",
                timeout=timeout,
            )

            # Wait for a specific selector if provided
            if wait_for_selector:
                try:
                    await page.wait_for_selector(
                        wait_for_selector,
                        timeout=min(timeout, 10000),
                    )
                except Exception:
                    logger.warning(f"Selector {wait_for_selector} not found, continuing...")

            # Wait for additional time after load
            if wait_after_load > 0:
                await page.wait_for_timeout(int(wait_after_load * 1000))

            # Get the rendered HTML
            html = await page.content()
            status_code = response.status if response else 0
            final_url = page.url

            logger.info(
                f"Scraped {url} -> {status_code} ({len(html)} bytes)"
            )

            return web.json_response({
                "html": html,
                "status": status_code,
                "url": final_url,
            })

        finally:
            await page.close()

    except Exception as e:
        logger.error(f"Error scraping {url}: {e}")
        return web.json_response(
            {"error": str(e)}, status=500
        )


async def handle_health(request: web.Request) -> web.Response:
    """Health check endpoint."""
    return web.json_response({"status": "ok"})


async def on_shutdown(app: web.Application):
    """Clean up browser on shutdown."""
    global _browser
    if _browser and _browser.is_connected():
        logger.info("Shutting down Camoufox browser...")
        try:
            await _browser._ctx_manager.__aexit__(None, None, None)
        except Exception:
            pass
        _browser = None


def create_app() -> web.Application:
    """Create the aiohttp application."""
    app = web.Application()
    app.router.add_post("/scrape", handle_scrape)
    app.router.add_get("/health", handle_health)
    app.on_shutdown.append(on_shutdown)
    return app


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app = create_app()
    logger.info(f"Starting Camoufox Scraper on port {port}")
    web.run_app(app, host="0.0.0.0", port=port)
