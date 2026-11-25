FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend ./frontend
COPY scripts/build.mjs ./scripts/build.mjs
COPY shared/frontend-policy.js ./shared/frontend-policy.js
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY shared ./shared
COPY server ./server
COPY --from=build /app/frontend/out ./frontend/out
RUN mkdir /data && chown node:node /data
USER node
ENV RELAY_HOST=0.0.0.0 RELAY_PORT=8080 RELAY_DB=/data/relay.db
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
