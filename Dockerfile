FROM node:14.18.1-alpine3.13 as building

# needed for git dependencies
RUN apk update && apk upgrade && \
    apk add --no-cache bash=5.1.16-r0 git=2.30.6-r0 openssh=8.4_p1-r4

RUN mkdir /council

WORKDIR /council

# we need specific npm version for git dependencies
RUN npm i -g npm@7.19.0

COPY ./package*.json ./
COPY ./yarn*.lock ./
RUN yarn install --frozen-lockfile --non-interactive && yarn cache clean

COPY ./tsconfig*.json ./
COPY ./src ./src

RUN yarn typechain && yarn build

FROM node:14.18.1-alpine3.13

ENV PORT=

RUN mkdir /council

WORKDIR /council

COPY --from=building /council/dist ./dist
COPY --from=building /council/node_modules ./node_modules
COPY ./package*.json ./

USER node

HEALTHCHECK --interval=120s --timeout=2s --retries=2 \
    CMD sh -c "wget -nv -t1 --spider http://localhost:$PORT/health" || exit 1

CMD ["yarn", "start:prod"]
