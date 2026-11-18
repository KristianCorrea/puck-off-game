# Puck Off — multiplayer server (Socket.IO + game-engine).
# Build from repo root: docker build -t puck-off-server .
FROM node:22-bookworm-slim AS base

WORKDIR /app

# Workspace manifests first for better layer caching.
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
COPY packages/game-engine/package.json packages/game-engine/

# Client is not needed at runtime; install server workspace (+ deps).
RUN npm ci --workspace=@puck-off/server --include-workspace-root

COPY packages/shared packages/shared
COPY packages/game-engine packages/game-engine
COPY apps/server apps/server

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start", "-w", "@puck-off/server"]
