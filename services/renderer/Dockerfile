FROM node:22-bookworm-slim

ENV TEXMFCACHE=/tmp/tex-cache

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates zint librsvg2-bin curl unzip \
  && mkdir -p /opt/context \
  # cont-lmt.zip is the official rolling ConTeXt LMTX distribution. It ships
  # LuaMetaTeX and the matching format files, unlike Debian's MKIV package.
  && curl -fL --retry 4 --retry-delay 3 https://www.pragma-ade.com/context/latest/cont-lmt.zip -o /tmp/cont-lmt.zip \
  && unzip -q /tmp/cont-lmt.zip -d /opt/context \
  && test -x /opt/context/tex/texmf-linux-64/bin/context \
  && chmod +x /opt/context/tex/texmf-linux-64/bin/context /opt/context/tex/texmf-linux-64/bin/mtxrun /opt/context/tex/texmf-linux-64/bin/luametatex \
  && mkdir -p /usr/local/share/texmf \
  && curl -fsSL https://modules.contextgarden.net/dl/basicexam-2026.04.28.zip -o /tmp/basicexam.zip \
  && unzip -q /tmp/basicexam.zip -d /usr/local/share/texmf \
  && mkdir -p /usr/share/texmf/tex/context/third \
  && cp -a /usr/local/share/texmf/tex/context/third/basicexam /usr/share/texmf/tex/context/third/ \
  && mkdir -p /usr/share/texmf/tex/context/modules/mkiv \
  && cp /usr/local/share/texmf/tex/context/third/basicexam/t-basicexam.mklx /usr/share/texmf/tex/context/modules/mkiv/ \
  && cp /usr/local/share/texmf/tex/context/third/basicexam/t-basicexam.mklx /usr/share/texmf/tex/context/modules/mkiv/t-basicexam.mkiv \
  && mkdir -p /usr/local/share/texmf/tex/context/modules/mkiv \
  && cp /usr/local/share/texmf/tex/context/third/basicexam/t-basicexam.mklx /usr/local/share/texmf/tex/context/modules/mkiv/ \
  && cp /usr/local/share/texmf/tex/context/third/basicexam/t-basicexam.mklx /usr/local/share/texmf/tex/context/modules/mkiv/t-basicexam.mkiv \
  && rm -f /tmp/basicexam.zip /tmp/cont-lmt.zip \
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

ENV CONTEXT_BIN=/opt/context/tex/texmf-linux-64/bin/context
ENV CONTEXT_VIA_MTXRUN=false
ENV NODE_ENV=production
WORKDIR /app/services/renderer
CMD ["sh", "-c", "mkdir -p \"$TEXMFCACHE\" && /opt/context/tex/texmf-linux-64/bin/mtxrun --generate && exec node worker.mjs"]
