# Lido Council Daemon

The Lido Council Daemon monitors deposit contract keys and compares them to Lido's unused keys. If a match is found, it attempts to pause deposits by sending a transaction to the `Deposit Security Module` contract. This document provides instructions for setting up and running the daemon, including necessary environment variables, an example configuration, and logging information.

## Table of Contents

- [Environment Variables](#environment-variables)
  - [RabbitMQ](#rabbitmq)
  - [Wallet Private Key](#wallet-private-key)
  - [Keys-API Configuration](#keys-api-configuration)
- [Example ENV Config File](#example-env-config-file)
- [Running the Application](#running-the-application)
  - [Run with Docker-Compose](#run-with-docker-compose)
  - [Logs](#logs)
- [Development](#development)
- [Prometheus Metrics](#prometheus-metrics)
- [Cache](#cache)
- [Test](#test)

## Environment Variables

Several environment variables must be set for the daemon to function properly. These variables include RabbitMQ settings, wallet private key, and Keys-API configuration.

### RabbitMQ

```env
...
PUBSUB_SERVICE=rabbitmq

RABBITMQ_URL=<rabbitmq url that supports ws>
RABBITMQ_LOGIN=<rabbitmq login>
RABBITMQ_PASSCODE=<rabbitmq password>
...
```

### Wallet Private Key

```env
...
WALLET_PRIVATE_KEY=<wallet private key>
...
```

In production, the private key is required. If omitted, a random key will be generated, and the daemon will run in test mode. Ensure the account balance has enough ETH to send transactions. The daemon does not spend funds in regular mode, and transactions are sent only if a potential attack is detected. 1 ETH is sufficient.

### Keys-API Configuration

```env
# Keys API
KEYS_API_PORT=3001

# chain id
# for mainnet 1
# for testnet 5
CHAIN_ID=5

RPC_URL=

# KeysAPI DB config
KEYS_API_DB_NAME=keys_service_db
KEYS_API_DB_PORT=5452
KEYS_API_DB_HOST=localhost
KEYS_API_DB_USER=test
KEYS_API_DB_PASSWORD=test

```

The Keys-API is publicly available, and more information can be found at https://github.com/lidofinance/lido-keys-api.

### Example ENV Config File

<details>

<summary>sample.env</summary>

```
# App
PORT=3000

# Log level: debug, info, notice, warning or error
LOG_LEVEL=info

# Log format: simple or json
LOG_FORMAT=simple

# Pubsub (default: rabbitmq)
PUBSUB_SERVICE=rabbitmq

# RabbitMQ
RABBITMQ_URL=wss://rabbitmq_url
RABBITMQ_LOGIN=test
RABBITMQ_PASSCODE=test

# Private key
# Used to sign transactions and stop the protocol.
# Make sure there are enough ETH on the balance to send a transaction to stop the protocol
WALLET_PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000001

KEYS_API_HOST=http://keys_api_service_api

# Keys API
KEYS_API_PORT=3001

# chain id
# for mainnet 1
# for testnet 5
CHAIN_ID=5

RPC_URL=

# KeysAPI DB config
KEYS_API_DB_NAME=keys_service_db
KEYS_API_DB_PORT=5452
KEYS_API_DB_HOST=localhost
KEYS_API_DB_USER=test
KEYS_API_DB_PASSWORD=test

```
</details>

## Running the Application
At this point, it is most convenient to run the application with docker-compose. Below is a configuration template for running the entire application:

<details>

<summary>docker-compose.yml</summary>

```yaml=
version: '3.7'

services:
  keys_api_service_db:
    image: postgres:14-alpine
    container_name: keys_api_service_db
    restart: unless-stopped
    environment:
      - POSTGRES_DB=${KEYS_API_DB_NAME}
      - POSTGRES_USER=${KEYS_API_DB_USER}
      - POSTGRES_PASSWORD=${KEYS_API_DB_PASSWORD}
    volumes:
      - ./.volumes/pgdata-${CHAIN_ID}/:/var/lib/postgresql/data

  keys_api_service_api:
    # get last hash from  https://docs.lido.fi/guides/tooling/#keys-api
    image: lidofinance/lido-keys-api@<latest-hash>
    container_name: keys_api_service_api
    environment:
      - PORT=3001
      - LOG_LEVEL=${LOG_LEVEL}
      - LOG_FORMAT=${LOG_FORMAT}
      - CHAIN_ID=${CHAIN_ID}
      - PROVIDERS_URLS=${RPC_URL}
      - VALIDATOR_REGISTRY_ENABLE=false
      - DB_NAME=${KEYS_API_DB_NAME}
      - DB_PORT=5432
      - DB_HOST=keys_api_service_db
      - DB_USER=${KEYS_API_DB_USER}
      - DB_PASSWORD=${KEYS_API_DB_PASSWORD}
    depends_on:
      - keys_api_service_db

  council_daemon:
    # get last hash from  https://docs.lido.fi/guides/tooling/#council-daemon
    image: lidofinance/lido-council-daemon@<latest-hash>
    ports:
      - "127.0.0.1:${PORT}:3000" # port is used for prometheus metrics
    environment:
      - PORT=3000
      - LOG_LEVEL=${LOG_LEVEL}
      - LOG_FORMAT=${LOG_FORMAT}
      - RPC_URL=${RPC_URL}
      - WALLET_PRIVATE_KEY=${WALLET_PRIVATE_KEY}
      - KEYS_API_HOST=http://keys_api_service_api
      - KEYS_API_PORT=3001
      - PUBSUB_SERVICE=rabbitmq
      - RABBITMQ_URL=${RABBITMQ_URL}
      - RABBITMQ_LOGIN=${RABBITMQ_LOGIN}
      - RABBITMQ_PASSCODE=${RABBITMQ_PASSCODE}
    depends_on:
      - keys_api_service_api
    volumes:
      - ./.volumes/cache/:/council/cache/

```
</details>

### Run with Docker-Compose

After updating the docker-compose file and the .env configuration file, simply enter the command:

```bash
docker-compose up -d
```

Next, we can read the log:
```bash
docker-compose logs -f
```

### Logs

On startup, the daemon checks if the provided wallet address belongs to the list of guardians, as well as account balance. If something goes wrong you will see warnings:

```log
warn: Private key is not provided, a random address will be generated for the test run
warn: Account balance is too low {"balance":"1.0 ETH"}
warn: Your address is not in the Guardian List {"address":"0x0000000000000000000000000000000000000000"}
```

If all goes well, it will be in the logs:

```log
info: Account balance is sufficient {"balance":"1.0 ETH"}
info: Your address is in the Guardian List {"address":"0x0000000000000000000000000000000000000000"}
```

At the first startup the daemon will collect historical data:

```log
info: Historical events are fetched {"endBlock":4487322,"events":3,"startBlock":4467323}
```

If the daemon works correctly, the logs will look like this:

```log
debug: Fresh events are fetched {"startBlock":5679826,"endBlock":5679976,"events":6}
debug: Fresh events are fetched {"startBlock":5679827,"endBlock":5679977,"events":6}
debug: Fresh events are fetched {"startBlock":5679828,"endBlock":5679978,"events":7}
info: No problems found {"type":"deposit","depositRoot":"0xc2c9308fa425a64ef9cac1837412ba462b6429fce2f170184284a260b735638c","nonce":12,"blockNumber":5679978,"blockHash":"0x87762c941f653f2f70157f86deac78f19e4d1549e231a52d1191289592d1a0ab","guardianAddress":"0x3dc4cF780F2599B528F37dedB34449Fb65Ef7d4A","guardianIndex":0,"signature":{"r":"0x44fec2e6fd34e74b8f001ef0e5bbd2db6d3179925fb82cb43231e19af46f0ddd","s":"0x2ff4326af760e353803458b75279eb8f58e5735b3565ea16bcd0f773bce106a4","_vs":"0xaff4326af760e353803458b75279eb8f58e5735b3565ea16bcd0f773bce106a4","recoveryParam":1,"v":28}}
debug: Fresh events are fetched {"startBlock":5679829,"endBlock":5679979,"events":7}
```

```log
info: Staking modules loaded
info: New staking router state cycle start
info: Sending a message to broker
info: New staking router state cycle end
```

## Development

### Copy env file for development and print your RPC_URL

```bash
cp develop.env ./.env
```

```diff
- RPC_URL=%NODE_URL%
+ RPC_URL=https://mainnet.infura.io/v3/***
```

### Starting the development environment (PostgreSQL, KAPI, Grafana, Prometheus, RabbitMQ)

```bash
docker-compose -f ./docker-compose.dev.yml up -d
```

### Run Council Daemon

```bash
# development
$ yarn start

# development watch mode
$ yarn start:dev
```


## Prometheus Metrics

Prometheus metrics are exposed via HTTP `/metrics` endpoint.

## Cache

Cache warming takes a lot of RPC queries and up to 30m of time (for mainnet). That cache is fully deterministic, fairly easily repopulated and you shouldn't be afraid to lose it.

To clear the cache use:

```bash
yarn cache:clear
```

## Test

```bash
# unit tests
$ yarn test

# e2e tests
$ yarn test:e2e

# test coverage
$ yarn test:cov
```

To run e2e tests, ensure the RPC_URL environment variable is set to the Goerli provider's endpoint, and generate private keys, which should be subsequently set in the WALLET_PRIVATE_KEY variable.

## Release flow

To create a new release:

1. Merge all changes to the `main` branch.
1. After the merge, the `Prepare release draft` action will run automatically. When the action is complete, a release draft is created.
1. When you need to release, go to Repo → Releases.
1. Publish the desired release draft manually by clicking the edit button - this release is now the `Latest Published`.
1. After publication, the action to create a release bump will be triggered automatically.
