# camoufox-scraper

Anti-detect browser rendering proxy with persistent identity. Renders web pages using [Camoufox](https://github.com/daijro/camoufox) (stealth Firefox fork) and returns raw HTML or structured extracted results via extraction profiles.

Built for SearXNG integration, general web scraping, and any pipeline that needs JS-rendered DOM from a browser that doesn't get flagged as a bot.

## Quick Start

```bash
# Build and start
docker compose up -d --build

# Verify it's running
curl http://localhost:8080/health

# Check active configuration
curl http://localhost:8080/config

# Scrape a page (raw HTML)
curl -X POST http://localhost:8080/scrape \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://example.com", "wait_after_load": 2}'

# Extract structured results using a profile
curl -X POST http://localhost:8080/extract \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://www.google.com/search?q=test&hl=en", "profile": "google_web"}'

# Run stealth probe (sannysoft, browserleaks, tls fingerprint)
pip install requests lxml
python test_probe.py
```

## Architecture

```
Any client (SearXNG, agent, script)
        │
        ▼
   POST /extract  or  POST /scrape
        │
        ▼
┌─────────────────────────────────────┐
│  camoufox-scraper (server.py)       │
│                                     │
│  Camoufox browser (persistent)      │
│  ├─ Pinned fingerprint (JSON file)  │
│  ├─ Persistent cookies/cache/history│
│  ├─ GeoIP-matched timezone/locale   │
│  └─ Human-like cursor movement      │
│                                     │
│  Extraction profiles (profiles/)    │
│  ├─ google_web.py                   │
│  ├─ google_news.py                  │
│  └─ base.py (generic XPath)         │
└─────────────────────────────────────┘
        │
        ▼
  Structured JSON or raw HTML
```

## API

### `GET /health`

Returns `{"status": "ok"}`.

### `GET /config`

Returns the active configuration (all env vars, resolved). Useful for debugging.

### `POST /scrape`

Renders a URL and returns **raw HTML**. Use this for general scraping, debugging, or feeding HTML to your own parser.

```json
// Request
{
  "url": "https://example.com",
  "wait_after_load": 2,
  "timeout": 30000,
  "wait_for_selector": "a h3",
  "wait_until": "domcontentloaded",
  "headers": {"Accept-Language": "en-US"}
}

// Response
{
  "html": "<!DOCTYPE html>...",
  "status": 200,
  "url": "https://example.com"
}
```

All fields except `url` are optional.

### `POST /extract`

Renders a URL, then runs an **extraction profile** to return structured results. Use this for search engine integration.

```json
// Request
{
  "url": "https://www.google.com/search?q=test&hl=en",
  "profile": "google_web",
  "timeout": 30000
}

// Response
{
  "results": [
    {"url": "https://...", "title": "...", "content": "snippet text..."},
    ...
  ],
  "suggestions": ["related search 1", "related search 2"],
  "captcha": false,
  "error": null
}
```

If `captcha` is `true`, the target site blocked the request. Results will be empty.

Without a named profile, you can pass inline XPath selectors:

```json
{
  "url": "https://some-site.com/search?q=test",
  "extract": {
    "results_xpath": "//div[@class='result']",
    "url_xpath": ".//a/@href",
    "title_xpath": ".//h3",
    "content_xpath": ".//p"
  }
}
```

## Extraction Profiles

Profiles are per-site extraction recipes in `profiles/`. Each profile knows how to parse a specific site's rendered HTML into structured results.

| Profile | File | Used For |
|---------|------|----------|
| `google_web` | `profiles/google_web.py` | Google Web Search — container-first extraction, `data-sncf` snippet attribute, URL de-tracking |
| `google_news` | `profiles/google_news.py` | Google News — `./read/` link extraction, base64 URL decoding, source/date metadata |
| `base` | `profiles/base.py` | Generic — takes XPath selectors from the request body |

### Creating a new profile

Create `profiles/my_site.py` with:

```python
CAPTCHA_PATTERNS = ["/blocked", "/captcha"]   # URL substrings indicating a block
WAIT_FOR_SELECTOR = "div.results"              # CSS selector to wait for before extracting
WAIT_AFTER_LOAD = 2                            # Seconds to wait after page load

def extract(page_html: str, page_url: str, **kwargs) -> dict:
    """Parse rendered HTML into structured results."""
    # ... your extraction logic using lxml ...
    return {
        "results": [{"url": "...", "title": "...", "content": "..."}],
        "suggestions": [],
    }
```

The profile is auto-discovered by name: `{"profile": "my_site"}` loads `profiles/my_site.py`.

## Configuration

All Camoufox parameters are configurable via environment variables. The image works out of the box with sensible defaults — only override what you need.

### Stealth & Fingerprint

| Variable | Default | Description |
|----------|---------|-------------|
| `CAMOUFOX_PERSISTENT` | `true` | Persistent context + fingerprint pinning. Set `false` for stateless mode (fresh fingerprint each launch). |
| `CAMOUFOX_OS` | `linux` | Claimed OS for fingerprint generation. Use `linux` on Linux containers to avoid TTL/font mismatches. |
| `CAMOUFOX_GEOIP` | `true` | Auto-match timezone, locale, language, and WebRTC IP to your public IP (or proxy IP). |
| `CAMOUFOX_HUMANIZE` | `true` | Natural cursor movement for Playwright-driven clicks. |
| `CAMOUFOX_ENABLE_CACHE` | `true` | HTTP cache and back/forward cache. A browser without cache is a bot signal. |
| `CAMOUFOX_BLOCK_WEBRTC` | `false` | `false` = let Camoufox spoof WebRTC IP (better). `true` = block entirely (more detectable). |
| `CAMOUFOX_BLOCK_WEBGL` | `false` | Block WebGL rendering. |
| `CAMOUFOX_BLOCK_IMAGES` | `false` | Block image loading (faster but less realistic). |

### Identity & Persistence

| Variable | Default | Description |
|----------|---------|-------------|
| `CAMOUFOX_USER_DATA_DIR` | `/userdata/profile` | Browser profile directory. Mount a volume here for persistence across restarts. |
| `CAMOUFOX_FINGERPRINT_PATH` | `/userdata/fingerprint.json` | Pinned fingerprint file. Generated on first launch, reused on subsequent launches. |
| `CAMOUFOX_SCREEN_WIDTH` | `1920` | Screen width for fingerprint generation. |
| `CAMOUFOX_SCREEN_HEIGHT` | `1080` | Screen height for fingerprint generation. |

### Network & Proxy

| Variable | Default | Description |
|----------|---------|-------------|
| `CAMOUFOX_PROXY` | *(empty)* | Proxy URL. Format: `socks5://user:pass@host:port` or `http://host:port`. When set with `GEOIP=true`, fingerprint auto-matches the proxy's region. |
| `CAMOUFOX_LOCALE` | *(empty)* | Override locale (e.g. `en-US`). Empty = let GeoIP auto-detect, or `en-US` if GeoIP is off. |

### Runtime

| Variable | Default | Description |
|----------|---------|-------------|
| `CAMOUFOX_HEADLESS` | `virtual` | `virtual` = Xvfb virtual display (recommended). `true` = native headless. `false` = requires real display. |
| `PORT` | `8080` | HTTP server port. |

### Fingerprint Lifecycle

- **First launch**: generates a fingerprint with BrowserForge, saves to `CAMOUFOX_FINGERPRINT_PATH`
- **Subsequent launches**: loads the saved fingerprint (same identity across restarts)
- **Proxy change**: if `CAMOUFOX_PROXY` changes, fingerprint auto-regenerates to match the new proxy's GeoIP
- **Manual reset**: delete `fingerprint.json` and the `profile/` directory, restart the container

## Stealth Probe Testing

`test_probe.py` tests the browser against public bot-detection sites and generates a report:

```bash
# Full probe (sannysoft + browserleaks + tls fingerprint)
python test_probe.py

# Quick probe (sannysoft only)
python test_probe.py --quick

# Custom service URL
python test_probe.py --url http://localhost:8090

# Test fingerprint persistence across container restart
python test_probe.py --check-persistence

# Save reports to custom directory
python test_probe.py -o ./my-reports

# Terminal-only output (no file saving)
python test_probe.py --no-save
```

### Probe sites

| Site | What it tests |
|------|--------------|
| `bot.sannysoft.com` | 30+ bot detection signals (webdriver, plugins, canvas, WebGL, etc.) |
| `browserleaks.com/webrtc` | WebRTC IP leak detection |
| `tls.peet.ws/api/all` | TLS fingerprint (JA3/JA4), HTTP/2 settings, user agent |

### Report output

Each run saves to `probe-reports/`:

```
probe-reports/
  probe_2026-03-22_143052.json    # Structured report (config + all test results)
  raw/
    sannysoft_2026-03-22_143052.html   # Raw rendered HTML from each probe site
    webrtc_2026-03-22_143052.html
    tls_2026-03-22_143052.html
    tls_full_2026-03-22_143052.json    # Complete TLS fingerprint data
```

The JSON report is designed for AI analysis — feed it to an LLM to get recommendations on improving stealth.

## Debugging

### When extraction breaks (e.g. Google changes their HTML)

1. **Capture the current HTML** via `/scrape`:
   ```bash
   curl -X POST http://localhost:8080/scrape \
     -H 'Content-Type: application/json' \
     -d '{"url": "https://www.google.com/search?q=test&hl=en", "wait_after_load": 3}' \
     | python -m json.tool | jq -r '.html' > google_current.html
   ```

2. **Test the profile against the saved HTML** (no browser needed):
   ```python
   from profiles import google_web
   data = google_web.extract(open('google_current.html').read(), 'https://...')
   for r in data['results']:
       print(r['title'], '|', r['content'][:60])
   ```

3. **Inspect the DOM** — open the HTML in a browser or search for key selectors:
   ```bash
   # Check if snippet attributes still exist
   grep -c 'data-sncf' google_current.html
   grep -c 'VwiC3b' google_current.html
   grep -c 'MjjYud' google_current.html
   ```

4. **Update the profile** — edit `profiles/google_web.py`, test again with step 2

5. **Deploy** — push to GitHub, CI builds new image, restart the pod

### Checking service state

```bash
# Active configuration
curl http://localhost:8080/config

# Service logs (Docker)
docker compose logs -f camoufox

# Fingerprint file
cat userdata/fingerprint.json | python -m json.tool

# Profile directory contents
ls -la userdata/profile/
```

## Troubleshooting

### CAPTCHA / blocked by Google

- **Symptom**: `/extract` returns `"captcha": true` or Google redirects to `/sorry`
- **Cause**: Google flagged the IP or browser fingerprint
- **Fixes**:
  - Wait — Google's block usually expires in 15-60 minutes
  - Add a residential proxy: `CAMOUFOX_PROXY=socks5://user:pass@proxy:port`
  - Reset the identity: delete `userdata/fingerprint.json` and `userdata/profile/`, restart
  - Google News (`google_news` profile) is much less aggressive than Web Search

### Empty snippets / missing content

- **Symptom**: results have titles and URLs but `content` is empty
- **Cause**: Google changed their HTML structure and the extraction selectors are stale
- **Fix**: follow the "When extraction breaks" debugging workflow above. The key selectors to check: `data-sncf` attribute for snippets, `MjjYud` class for result containers, `a[h3]/h3` for titles.

### Port already in use

- **Symptom**: `docker compose up` fails with "port is already allocated"
- **Fix**: change the port mapping in `docker-compose.yml` (e.g. `"8090:8080"`)

### Browser fails to launch

- **Symptom**: `/scrape` returns 500 error, logs show Camoufox launch failure
- **Fixes**:
  - Check memory limits — Camoufox needs ~512MB minimum
  - Ensure Xvfb deps are installed (the Dockerfile handles this)
  - Try `CAMOUFOX_HEADLESS=true` instead of `virtual` (native headless, less stealth but simpler)

### Fingerprint not persisting

- **Symptom**: logs show "Generated and saved new fingerprint" on every restart
- **Cause**: `/userdata` volume not mounted, or permissions issue
- **Fix**: ensure `docker-compose.yml` has `volumes: ["./userdata:/userdata"]` and the directory is writable

### WebRTC IP leak

- **Symptom**: `test_probe.py` shows public IP exposed via WebRTC
- **Cause**: expected without a proxy. Camoufox spoofs WebRTC to match your IP, but your IP is your IP.
- **Fix**: add a residential proxy (`CAMOUFOX_PROXY`), then GeoIP will spoof the proxy's IP instead

### "Chrome missing" on sannysoft

- **Symptom**: sannysoft reports "Chrome: missing (failed)"
- **Cause**: this is a **false positive** — sannysoft checks for `window.chrome` which only exists in Chromium browsers. Camoufox is Firefox-based, so this test will always "fail". It's not a real detection vector.
