# syntax=docker/dockerfile:1
# Node 22 is the existing README/CI/Render contract. Debian keeps Prisma and
# argon2 on glibc/OpenSSL 3 in both the build and runtime stages.
FROM node:22-bookworm-slim AS base
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
ENV PRISMA_SKIP_POSTINSTALL_GENERATE=true
COPY package.json package-lock.json ./
COPY packages/rules/package.json packages/rules/tsconfig.json ./packages/rules/
COPY packages/rules/src ./packages/rules/src
COPY packages/server/package.json ./packages/server/
# npm uses the complete workspace lockfile; web is metadata only, never built.
COPY packages/web/package.json ./packages/web/
# The root postinstall builds rules, so its source is deliberately present here.
RUN npm ci --workspace=rules --workspace=server --include-workspace-root --include=dev --no-audit --no-fund
COPY scripts/generatePrisma.mjs scripts/testDatabase.cjs scripts/testDatabase.d.cts ./scripts/
COPY packages/server/tsconfig.json ./packages/server/
COPY packages/server/scripts ./packages/server/scripts
COPY packages/server/prisma ./packages/server/prisma
COPY packages/server/src ./packages/server/src
RUN npm run -w rules build \
    && npm run -w server prisma:generate -- --force \
    && npm run -w server build

FROM build AS production-dependencies
# Prisma CLI is deliberately a server runtime dependency: the same image runs
# the separate migration job. Pruning must not run the root build lifecycle.
# npm retains Prisma's optional TypeScript peer; compiled JS + schema.prisma
# does not use a TypeScript Prisma config, so remove that compiler too.
RUN npm prune --omit=dev --omit=peer --workspace=rules --workspace=server --include-workspace-root --ignore-scripts --no-save --no-audit --no-fund \
    && mkdir -p packages/server/node_modules \
    && rm -rf node_modules/typescript \
    && rm -f node_modules/.bin/tsc node_modules/.bin/tsserver \
    && rm -rf packages/server/dist/tests packages/rules/dist/tests \
    && rm -f packages/rules/dist/manualTest.* packages/rules/dist/manualTurnOrderTest.*

FROM base AS runtime
ENV NODE_ENV=production PORT=3000
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json ./
COPY --from=production-dependencies --chown=node:node /app/packages/rules/package.json ./packages/rules/package.json
COPY --from=production-dependencies --chown=node:node /app/packages/rules/dist ./packages/rules/dist
COPY --from=production-dependencies --chown=node:node /app/packages/server/package.json ./packages/server/package.json
COPY --from=production-dependencies --chown=node:node /app/packages/server/node_modules ./packages/server/node_modules
COPY --from=production-dependencies --chown=node:node /app/packages/server/dist ./packages/server/dist
COPY --from=production-dependencies --chown=node:node /app/packages/server/prisma ./packages/server/prisma
COPY --chown=node:node scripts/docker-healthcheck.cjs ./scripts/docker-healthcheck.cjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=8s --start-period=30s --retries=3 \
    CMD ["node", "scripts/docker-healthcheck.cjs"]
# No npm/shell wrapper: SIGTERM reaches Node and its existing shutdown hooks.
# Migrations belong to a separate job, never this server command.
CMD ["node", "packages/server/dist/index.js"]
