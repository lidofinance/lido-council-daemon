FROM node:14.18.1-alpine3.13 as building

# needed for git dependencies
RUN apk update && apk upgrade && \
    apk add --no-cache bash git openssh

WORKDIR /usr/src/app

# we need specific npm version for git dependencies
RUN npm i -g npm@7.19.0

COPY ./package*.json ./
COPY ./yarn*.lock ./
RUN yarn install --frozen-lockfile --non-interactive && yarn cache clean

COPY ./tsconfig*.json ./
COPY ./src ./src

RUN yarn typechain
RUN yarn build

FROM node:14.18.1-alpine3.13

WORKDIR /usr/src/app

COPY --from=building /usr/src/app/dist ./dist
COPY --from=building /usr/src/app/node_modules ./node_modules
COPY ./package*.json ./
COPY ./yarn*.lock ./

CMD ["yarn", "start:prod"]
