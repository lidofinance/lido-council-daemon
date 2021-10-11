FROM node:14-alpine

WORKDIR /app
COPY package.json yarn.lock ./

RUN yarn install --frozen-lockfile --non-interactive && yarn cache clean

ARG NODE_ENV="production"
ARG PORT=3000
ARG LOG_LEVEL=""
ARG LOG_FORMAT=""
ARG RPC_URL=""
ARG COUNCIL_ID=""
ARG KAFKA_BROKER_1=""

ENV NODE_ENV=$NODE_ENV \
  PORT=$PORT \
  LOG_LEVEL=$LOG_LEVEL \
  LOG_FORMAT=$LOG_FORMAT \
  RPC_URL=$RPC_URL \
  COUNCIL_ID=$COUNCIL_ID \
  KAFKA_BROKER_1=$KAFKA_BROKER_1

EXPOSE $PORT

COPY . .
RUN yarn build

CMD ["yarn", "start:prod"]
