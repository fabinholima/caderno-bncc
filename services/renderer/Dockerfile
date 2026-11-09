FROM node:22-bookworm-slim

ENV TEXMFCACHE=/tmp/tex-cache

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates zint librsvg2-bin curl unzip \
  && mkdir -p /opt/context \
  # This platform archive contains the Linux LuaMetaTeX binary and installer.
  # cont-lmt.zip is source-only and does not contain the executable.
  && curl -fL --retry 4 --retry-delay 3 https://lmtx.pragma-ade.nl/install-lmtx/context-linux-64.zip -o /tmp/context-linux-64.zip \
  && unzip -q /tmp/context-linux-64.zip -d /opt/context \
  && chmod +x /opt/context/install.sh \
  && cd /opt/context \
  && ./install.sh \
  && cd / \
  && test -f /opt/context/tex/texmf-linux-64/bin/context \
  && chmod +x /opt/context/tex/texmf-linux-64/bin/context /opt/context/tex/texmf-linux-64/bin/mtxrun /opt/context/tex/texmf-linux-64/bin/luametatex \
  && mkdir -p /usr/local/share/texmf \
  && curl -fsSL https://modules.contextgarden.net/dl/basicexam-2026.04.28.zip -o /tmp/basicexam.zip \
  && unzip -q /tmp/basicexam.zip -d /usr/local/share/texmf \
  && mkdir -p /opt/context/tex/texmf-context/tex/context/third \
  && cp -a /usr/local/share/texmf/tex/context/third/basicexam /opt/context/tex/texmf-context/tex/context/third/ \
  && mkdir -p /opt/context/tex/texmf-context/tex/context/modules/mkxl \
  && cp /usr/local/share/texmf/tex/context/third/basicexam/t-basicexam.mklx /opt/context/tex/texmf-context/tex/context/modules/mkxl/ \
  && cp /usr/local/share/texmf/tex/context/third/basicexam/t-basicexam.mklx /opt/context/tex/texmf-context/tex/context/modules/mkxl/t-basicexam.mkxl \
  && cp /usr/local/share/texmf/tex/context/third/basicexam/t-basicexam.mklx /opt/context/tex/texmf-context/tex/context/modules/mkxl/m-basicexam.mkxl \
  && mkdir -p /usr/share/texmf/tex/context/third \
  && cp -a /usr/local/share/texmf/tex/context/third/basicexam /usr/share/texmf/tex/context/third/ \
  && mkdir -p /usr/share/texmf/tex/context/modules/mkiv \
  && cp /usr/local/share/texmf/tex/context/third/basicexam/t-basicexam.mklx /usr/share/texmf/tex/context/modules/mkiv/ \
  && cp /usr/local/share/texmf/tex/context/third/basicexam/t-basicexam.mklx /usr/share/texmf/tex/context/modules/mkiv/t-basicexam.mkiv \
  && mkdir -p /usr/local/share/texmf/tex/context/modules/mkiv \
  && cp /usr/local/share/texmf/tex/context/third/basicexam/t-basicexam.mklx /usr/local/share/texmf/tex/context/modules/mkiv/ \
  && cp /usr/local/share/texmf/tex/context/third/basicexam/t-basicexam.mklx /usr/local/share/texmf/tex/context/modules/mkiv/t-basicexam.mkiv \
  && rm -f /tmp/basicexam.zip /tmp/context-linux-64.zip \
  && mkdir -p "$TEXMFCACHE" \
  && /opt/context/tex/texmf-linux-64/bin/mtxrun --generate \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY services/api/package*.json services/api/
RUN cd services/api && npm install --omit=dev
COPY services/api services/api
COPY lib /app/lib
COPY services/renderer/package*.json services/renderer/
RUN cd services/renderer && npm install --omit=dev
COPY services/renderer services/renderer

ENV CONTEXT_BIN=/opt/context/tex/texmf-linux-64/bin/mtxrun
ENV CONTEXT_VIA_MTXRUN=true
ENV CONTEXT_SCRIPT=/opt/context/tex/texmf-context/scripts/context/lua/mtx-context.lua
ENV NODE_ENV=production
# Sem root: o ConTeXt escreve só no próprio cache e no volume de dados.
RUN mkdir -p /app/tmp /var/data "$TEXMFCACHE" \
  && chown -R node:node /app/tmp /var/data "$TEXMFCACHE"
USER node
WORKDIR /app/services/renderer
CMD ["sh", "-c", "mkdir -p \"$TEXMFCACHE\" && /opt/context/tex/texmf-linux-64/bin/mtxrun --generate && exec node worker.mjs"]
