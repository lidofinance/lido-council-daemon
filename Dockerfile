FROM node:24.22.1-alpine3.23 AS building

WORKDIR /council

COPY package.json yarn.lock ./
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN yarn install --frozen-lockfile --non-interactive && yarn build

FROM node:24.22.1-alpine3.23 AS dependencies

WORKDIR /council

COPY package.json yarn.lock ./
# Native dependencies ship prebuilt binaries. TypeChain runs in the build stage.
RUN yarn install --production --frozen-lockfile --non-interactive --ignore-scripts && yarn cache clean

FROM node:24.22.1-alpine3.23

ENV PORT=

WORKDIR /council

COPY --from=building /council/dist ./dist
COPY --from=dependencies /council/node_modules ./node_modules
COPY package.json ./
COPY scripts/check-runtime.cjs ./scripts/check-runtime.cjs

RUN mkdir cache && chown node:node cache

USER node

HEALTHCHECK --interval=120s --timeout=10s --retries=2 \
    CMD sh -c "wget -nv -t1 --spider http://localhost:$PORT/health" || exit 1

CMD ["node", "--max-old-space-size=8192", "dist/main"]
