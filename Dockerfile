FROM node:14.18.1-alpine3.13 as building

# needed for git dependencies
RUN apk update && apk upgrade && \
    apk add --no-cache bash=5.1.16-r0 git=2.30.6-r0 openssh=8.4_p1-r4 python3=3.8.15-r0 make=4.3-r0 g++=10.2.1_pre1-r3

RUN mkdir /council

WORKDIR /council

# we need specific npm version for git dependencies
RUN npm i -g npm@7.19.0

COPY ./package*.json ./
COPY ./yarn*.lock ./
COPY ./src ./src
RUN yarn install --frozen-lockfile --non-interactive && yarn cache clean

COPY ./tsconfig*.json ./

RUN yarn typechain && yarn build

FROM node:14.18.1-alpine3.13

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
