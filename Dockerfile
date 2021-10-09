FROM node:14-alpine

WORKDIR /app
COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile --non-interactive && yarn cache clean

ARG NODE_ENV="production"
ARG PORT=3000
ARG LOG_LEVEL=""
ARG LOG_FORMAT=""
ARG RPC_URL=""

ENV NODE_ENV=$NODE_ENV \
  PORT=$PORT \
  LOG_LEVEL=$LOG_LEVEL \
  LOG_FORMAT=$LOG_FORMAT \
  RPC_URL=$RPC_URL

EXPOSE $PORT

COPY . .
RUN yarn build

CMD ["yarn", "start:prod"]
