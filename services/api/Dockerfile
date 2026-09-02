FROM node:24-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY *.mjs ./
USER node
EXPOSE 8788
CMD ["node", "server.mjs"]
