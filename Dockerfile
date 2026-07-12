# syntax=docker/dockerfile:1.7
FROM node:24.18.0-bookworm-slim@sha256:cb4e8f7c443347358b7875e717c29e27bf9befc8f5a26cf18af3c3dec80e58c5 AS base

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install --global pnpm@11.11.0
WORKDIR /app

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM dependencies AS build
COPY . .
RUN pnpm build

FROM dependencies AS production-dependencies
# Husky is a development-only prepare hook. Pruning removes its binary, so
# lifecycle scripts must not run in the production dependency stage.
RUN pnpm prune --prod --ignore-scripts

FROM base AS runtime
ENV NODE_ENV=production
ENV BLACKWATER_BIND=0.0.0.0
ENV BLACKWATER_PORT=8787
ENV BLACKWATER_DATA_DIR=/var/lib/blackwater

RUN apt-get update \
    && apt-get install --yes --no-install-recommends util-linux ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 blackwater \
    && useradd --uid 10001 --gid 10001 --create-home --shell /usr/sbin/nologin blackwater \
    && install -d -o 10001 -g 10001 -m 0700 /var/lib/blackwater

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./package.json

USER 10001:10001
ENTRYPOINT ["flock", "--exclusive", "--nonblock", "--no-fork", "/var/lib/blackwater/server.lock"]
CMD ["node", "dist/server/index.js"]
