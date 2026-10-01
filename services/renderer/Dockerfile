FROM node:22-bookworm-slim

ENV TEXMFCACHE=/tmp/tex-cache

RUN apt-get update \
  && apt-get install -y --no-install-recommends context zint librsvg2-bin \
  && mkdir -p "$TEXMFCACHE" \
  && mtxrun --generate \
  && context --generate \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY services/api/package*.json services/api/
RUN cd services/api && npm install --omit=dev
COPY services/api services/api
COPY lib /app/lib
COPY services/renderer/package*.json services/renderer/
RUN cd services/renderer && npm install --omit=dev
COPY services/renderer services/renderer

ENV CONTEXT_BIN=/usr/bin/context
ENV CONTEXT_VIA_MTXRUN=false
ENV NODE_ENV=production
WORKDIR /app/services/renderer
CMD ["node", "worker.mjs"]
