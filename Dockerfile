FROM node:24.22.1-alpine3.23 AS building

WORKDIR /council

COPY package.json yarn.lock ./
COPY src/abi ./src/abi
RUN yarn install --frozen-lockfile --non-interactive
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN yarn build

FROM node:24.22.1-alpine3.23 AS dependencies

WORKDIR /council

COPY package.json yarn.lock ./
# Native dependencies ship prebuilt binaries. TypeChain runs in the build stage.
RUN yarn install --production --frozen-lockfile --non-interactive --ignore-scripts && yarn cache clean

FROM node:24.22.1-alpine3.23

ENV PORT=3000
ENV NODE_OPTIONS=--max-old-space-size=8192

WORKDIR /council

COPY --from=building /council/dist ./dist
COPY --from=dependencies /council/node_modules ./node_modules
COPY package.json ./
COPY scripts/check-runtime.cjs ./scripts/check-runtime.cjs

RUN mkdir cache && chown node:node cache

ARG BUILD_VERSION=dev
ARG BUILD_BRANCH=dev
ARG BUILD_COMMIT=dev
# The build fails on an empty value and on a version longer than 31 bytes,
# the limit of guardian messages
RUN node -e " \
  const info = { version: process.env.BUILD_VERSION, branch: process.env.BUILD_BRANCH, commit: process.env.BUILD_COMMIT }; \
  for (const [field, value] of Object.entries(info)) if (!value) throw new Error('BUILD_' + field.toUpperCase() + ' is empty'); \
  if (Buffer.byteLength(info.version) > 31) throw new Error('BUILD_VERSION is longer than 31 bytes'); \
  require('fs').writeFileSync('build-info.json', JSON.stringify(info));"

USER 1000:1000

HEALTHCHECK --interval=120s --timeout=10s --retries=2 \
    CMD sh -c "wget -nv -t1 --spider http://localhost:$PORT/health" || exit 1

CMD ["node", "dist/main"]
