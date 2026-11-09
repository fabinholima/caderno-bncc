# Portal (vinext): build de produção servido pelo `vinext start`, como no Render.
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/api/package.json services/api/
COPY services/renderer/package.json services/renderer/
RUN pnpm install --frozen-lockfile
COPY . .
# O endereço da API fica gravado no código do portal durante o build.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN pnpm build

FROM node:22-bookworm-slim
# Servidor de produção do vinext (Node), não o `wrangler dev`, que é de
# desenvolvimento. Roda como o usuário sem privilégios `node` da imagem.
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "node_modules/vinext/dist/cli.js", "start", "--hostname", "0.0.0.0", "--port", "3000"]
