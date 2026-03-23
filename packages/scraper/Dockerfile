FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for Camoufox + Xvfb
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    libasound2t64 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libxshmfence1 \
    libxtst6 \
    fonts-liberation \
    fonts-noto-color-emoji \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Fetch the Camoufox browser binary
RUN python -m camoufox fetch

# Copy the service
COPY server.py .

# Default userdata directory for persistent browser identity (override with volume mount)
RUN mkdir -p /userdata

# Default environment — all configurable at runtime
ENV PORT=8080
ENV CAMOUFOX_HEADLESS=virtual
ENV CAMOUFOX_OS=linux
ENV CAMOUFOX_GEOIP=true
ENV CAMOUFOX_HUMANIZE=true
ENV CAMOUFOX_ENABLE_CACHE=true
ENV CAMOUFOX_BLOCK_WEBRTC=false
ENV CAMOUFOX_BLOCK_WEBGL=false
ENV CAMOUFOX_BLOCK_IMAGES=false
ENV CAMOUFOX_PERSISTENT=true
ENV CAMOUFOX_USER_DATA_DIR=/userdata/profile
ENV CAMOUFOX_FINGERPRINT_PATH=/userdata/fingerprint.json
ENV CAMOUFOX_LOCALE=
ENV CAMOUFOX_PROXY=
ENV CAMOUFOX_SCREEN_WIDTH=1920
ENV CAMOUFOX_SCREEN_HEIGHT=1080

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8080/health')" || exit 1

CMD ["python", "server.py"]
