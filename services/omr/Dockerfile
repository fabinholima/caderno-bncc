# Dependências instaladas exatamente como no pnpm-lock.yaml (builds reproduzíveis).
FROM node:24-bookworm-slim AS deps
WORKDIR /src
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/api/package.json services/api/
COPY services/renderer/package.json services/renderer/
RUN pnpm install --frozen-lockfile --prod --filter @caderno/api

FROM node:24-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv python3-pip poppler-utils \
  && rm -rf /var/lib/apt/lists/* \
  && python3 -m venv /opt/venv-omr

COPY --from=deps /src/node_modules /app/node_modules
COPY --from=deps /src/services/api/node_modules /app/services/api/node_modules

COPY services/omr/requirements.txt /app/services/omr/requirements.txt
RUN /opt/venv-omr/bin/pip install --no-cache-dir -r /app/services/omr/requirements.txt

COPY services/api /app/services/api
COPY services/omr /app/services/omr
COPY lib /app/lib

ENV OMR_PYTHON=/opt/venv-omr/bin/python
ENV NODE_ENV=production
# Sem root: o worker só usa arquivos temporários em /tmp.
USER node

CMD ["node", "services/omr/worker.mjs"]
