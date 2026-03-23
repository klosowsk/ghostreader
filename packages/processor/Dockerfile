# Build context must be the monorepo root (ghostreader/)
# Usage: docker build -f packages/processor/Dockerfile .

# Stage 1: Build UI
FROM node:22-slim AS ui-builder
WORKDIR /ui
COPY packages/ui/package.json packages/ui/package-lock.json ./
RUN npm ci
COPY packages/ui/ ./
RUN npm run build

# Stage 2: Build processor
FROM node:22-slim AS processor-builder
WORKDIR /app
COPY packages/processor/package.json packages/processor/tsconfig.json ./
COPY packages/processor/src/ src/
RUN npm install && npm run build

# Stage 3: Production
FROM node:22-slim
WORKDIR /app

COPY packages/processor/package.json ./
RUN npm install --production

COPY --from=processor-builder /app/dist/ dist/
COPY --from=ui-builder /ui/dist/ public/

ENV PORT=3000
ENV SCRAPER_URL=http://localhost:8080
ENV OLLAMA_URL=http://localhost:11434
ENV OLLAMA_AI_MODEL=milkey/reader-lm-v2:latest
ENV OLLAMA_MAX_CONTEXT=131072

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
