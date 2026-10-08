FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY config.js docker-entrypoint.sh ./
COPY src ./src

# the node's keypair and held transmissions live here; mount a volume on it
ENV HOST=0.0.0.0 PORT=3000 DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data
VOLUME /data

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "src/server.js"]
