FROM node:22-slim AS builder

WORKDIR /app

COPY package.json tsconfig.json ./
COPY src/ src/
RUN npm install && npm run build

FROM node:22-slim

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY --from=builder /app/dist/ dist/

ENV PORT=3000
ENV SCRAPER_URL=http://localhost:8080
ENV OLLAMA_URL=http://localhost:11434
ENV OLLAMA_DEFAULT_MODEL=reader-lm:1.5b

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD node -e "fetch('http://localhost:3000/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "dist/index.js"]
