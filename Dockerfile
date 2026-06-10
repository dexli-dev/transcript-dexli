# Multi-stage build: tiny final image, full devDeps only during build.
#
# transcript.dexli.dev — no submodules, no runtime dependencies beyond the
# adapter-node output. All transcript parsing happens client-side; the server
# only serves the shell.

# ---- Stage 1: build the app -----------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --ignore-scripts

COPY . .

# Produce the adapter-node build output at /app/build.
RUN npm run build

# Drop dev dependencies so we copy only runtime deps into the final stage.
RUN npm prune --omit=dev

# ---- Stage 2: runtime -----------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

LABEL org.opencontainers.image.title="transcript" \
      org.opencontainers.image.description="transcript.dexli.dev — drop a JSONL transcript and read it as a conversation. Parsed entirely in the browser. Part of the dexli.dev tiny-tools family." \
      org.opencontainers.image.source="https://github.com/dexli-dev/transcript-dexli" \
      org.opencontainers.image.licenses="UNLICENSED"

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000

COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

EXPOSE 3000

USER node

CMD ["node", "build"]
