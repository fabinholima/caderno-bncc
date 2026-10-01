FROM node:22-bookworm-slim

ENV TEXMFCACHE=/tmp/tex-cache

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates zint librsvg2-bin curl unzip \
  && mkdir -p /opt/context \
  && curl -fsSL https://lmtx.pragma-ade.com/install-lmtx/context-linux-64.zip -o /tmp/context-lmtx.zip \
  && unzip -q /tmp/context-lmtx.zip -d /opt/context \
  && cd /opt/context \
  && sh install.sh \
  && ln -sf /opt/context/bin/mtxrun /usr/local/bin/mtxrun \
  && mkdir -p /usr/local/share/texmf \
  && curl -fsSL https://modules.contextgarden.net/dl/basicexam-2026.04.28.zip -o /tmp/basicexam.zip \
  && unzip -q /tmp/basicexam.zip -d /usr/local/share/texmf \
  && mkdir -p /opt/context/tex/texmf-context/tex/context/third \
  && cp -a /usr/local/share/texmf/tex/context/third/basicexam /opt/context/tex/texmf-context/tex/context/third/ \
  && mkdir -p /usr/local/texlive/2026/texmf-dist/tex/context/third \
  && cp -a /usr/local/share/texmf/tex/context/third/basicexam /usr/local/texlive/2026/texmf-dist/tex/context/third/ \
  && mkdir -p /usr/local/share/texmf/tex/context/modules/mkiv \
  && cp /usr/local/share/texmf/tex/context/third/basicexam/t-basicexam.mklx /usr/local/share/texmf/tex/context/modules/mkiv/ \
  && cp /usr/local/share/texmf/tex/context/third/basicexam/t-basicexam.mklx /usr/local/share/texmf/tex/context/modules/mkiv/t-basicexam.mkiv \
  && rm -f /tmp/basicexam.zip \
  && mkdir -p "$TEXMFCACHE" \
  && /usr/local/bin/mtxrun --generate \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY services/api/package*.json services/api/
RUN cd services/api && npm install --omit=dev
COPY services/api services/api
COPY lib /app/lib
COPY services/renderer/package*.json services/renderer/
RUN cd services/renderer && npm install --omit=dev
COPY services/renderer services/renderer

ENV CONTEXT_BIN=/usr/local/bin/mtxrun
ENV CONTEXT_VIA_MTXRUN=true
ENV NODE_ENV=production
WORKDIR /app/services/renderer
CMD ["sh", "-c", "mkdir -p \"$TEXMFCACHE\" && mtxrun --generate && exec node worker.mjs"]
