FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends context zint librsvg2-bin \
  && mtxrun --generate \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY services/api/package*.json services/api/
RUN cd services/api && npm install --omit=dev
COPY services/api services/api
COPY lib /app/lib
COPY services/renderer/package*.json services/renderer/
RUN cd services/renderer && npm install --omit=dev
COPY services/renderer services/renderer

ENV CONTEXT_BIN=/usr/bin/mtxrun
ENV CONTEXT_VIA_MTXRUN=true
ENV NODE_ENV=production
ENV TEXMFCACHE=/tmp/tex-cache
WORKDIR /app/services/renderer
CMD ["node", "worker.mjs"]
