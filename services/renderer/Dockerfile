# Dependências instaladas exatamente como no pnpm-lock.yaml (builds reproduzíveis).
FROM node:22-bookworm-slim AS deps
WORKDIR /src
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/api/package.json services/api/
COPY services/renderer/package.json services/renderer/
RUN pnpm install --frozen-lockfile --prod --filter @caderno/api --filter @caderno/renderer

FROM node:22-bookworm-slim

ENV TEXMFCACHE=/tmp/tex-cache

# Somas SHA-256 dos downloads externos. O instalador do ConTeXt é "rolling":
# quando a Pragma publica outro, o build falha aqui de propósito. Para atualizar,
# baixe o arquivo, confira e troque a soma (sha256sum context-linux-64.zip).
ARG CONTEXT_INSTALLER_SHA256=838f3f64e2d5d03293a4781b4440cb85e066fbca34eddcdff430a6fe8970d4db
ARG BASICEXAM_SHA256=1067b522309f5a646f3e30ca7f86375b357c97336a4b2c476e1abae359b68d6e

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates zint librsvg2-bin curl unzip \
  && mkdir -p /opt/context \
  # This platform archive contains the Linux LuaMetaTeX binary and installer.
  # cont-lmt.zip is source-only and does not contain the executable.
  && curl -fL --retry 4 --retry-delay 3 https://lmtx.pragma-ade.nl/install-lmtx/context-linux-64.zip -o /tmp/context-linux-64.zip \
  && echo "${CONTEXT_INSTALLER_SHA256}  /tmp/context-linux-64.zip" | sha256sum -c - \
  && unzip -q /tmp/context-linux-64.zip -d /opt/context \
  && chmod +x /opt/context/install.sh \
  && cd /opt/context \
  && ./install.sh \
  && cd / \
  && test -f /opt/context/tex/texmf-linux-64/bin/context \
  && chmod +x /opt/context/tex/texmf-linux-64/bin/context /opt/context/tex/texmf-linux-64/bin/mtxrun /opt/context/tex/texmf-linux-64/bin/luametatex \
  && mkdir -p /usr/local/share/texmf \
  && curl -fsSL https://modules.contextgarden.net/dl/basicexam-2026.04.28.zip -o /tmp/basicexam.zip \
  && echo "${BASICEXAM_SHA256}  /tmp/basicexam.zip" | sha256sum -c - \
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
COPY --from=deps /src/node_modules node_modules
COPY --from=deps /src/services/api/node_modules services/api/node_modules
COPY --from=deps /src/services/renderer/node_modules services/renderer/node_modules
COPY services/api services/api
COPY lib /app/lib
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
