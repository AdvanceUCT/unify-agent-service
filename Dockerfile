# syntax=docker/dockerfile:1.7

# ----------- builder stage -----------
# We build inside a fuller Debian image so node-pre-gyp can fetch (and, if needed,
# compile) the native bindings that Credo's askar / anoncreds / indy-vdr packages
# rely on. python3, make, g++ and libc6-dev cover the gyp build dependencies.
FROM node:22-bookworm-slim AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       python3 \
       make \
       g++ \
       libc6-dev \
       ca-certificates \
       curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./

# If a lockfile is present we use the deterministic install path; otherwise we
# fall back to `npm install` which will produce one on first build.
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

COPY tsconfig.json tsconfig.test.json ./
COPY src ./src
COPY genesis ./genesis

RUN npm test

RUN npm run build

# ----------- runner stage -----------
# Same base image so the prebuilt .so / .node binaries that landed in the
# builder's node_modules during install remain ABI-compatible.
FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/genesis ./genesis

# Credo writes the encrypted Askar wallet + cache under ${HOME}/.afj. For the
# unprivileged `node` user that ships with the official Node images this
# resolves to /home/node/.afj. We pre-create the directory with the right
# owner so the docker-compose volume mount inherits sensible permissions.
RUN mkdir -p /home/node/.afj/data /home/node/.afj/cache \
    && chown -R node:node /home/node/.afj /app

USER node

EXPOSE 3000 3001

CMD ["node", "dist/index.js"]
