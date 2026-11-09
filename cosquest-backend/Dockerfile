# CosQuest backend image (test server deploys build this; see DEPLOY.md).
FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY vendor ./vendor
RUN npm ci --omit=dev --no-audit --no-fund
COPY . .
RUN mkdir -p /data/uploads && chown -R node:node /data/uploads /app
USER node
EXPOSE 8080
CMD ["node", "server.js"]
