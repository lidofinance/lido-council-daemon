FROM node:18.14.2-alpine3.16 as building


# needed for git dependencies
RUN apk update && apk upgrade && \
    apk add --no-cache git=2.36.6-r0

RUN mkdir /council

WORKDIR /council

# we need specific npm version for git dependencies
RUN npm i -g npm@7.19.0

COPY ./package*.json ./
COPY ./yarn*.lock ./
COPY ./tsconfig*.json ./
COPY ./src ./src
RUN yarn install --frozen-lockfile --non-interactive && yarn cache clean

RUN yarn typechain && yarn build

FROM node:18.14.2-alpine3.16

ENV PORT=

RUN mkdir /council

WORKDIR /council

COPY --from=building /council/dist ./dist
COPY --from=building /council/node_modules ./node_modules
COPY ./package*.json ./


USER node

HEALTHCHECK --interval=120s --timeout=10s --retries=2 \
    CMD sh -c "wget -nv -t1 --spider http://localhost:$PORT/health" || exit 1

CMD ["yarn", "start:prod"]
