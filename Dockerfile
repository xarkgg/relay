FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY shared ./shared
COPY server ./server
COPY public ./public
RUN mkdir /data && chown node:node /data
USER node
ENV RELAY_HOST=0.0.0.0 RELAY_PORT=8080 RELAY_DB=/data/relay.db
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:8080/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
