# Lido Council Daemon

The Lido Council Daemon monitors deposit contract keys and compares them to Lido's unused keys. If a match is found, it attempts to pause deposits by sending a transaction to the `Deposit Security Module` contract. This document provides instructions for setting up and running the daemon, including necessary environment variables, an example configuration, and logging information.

## Table of Contents

- [Environment Variables](#environment-variables)
  - [Data Bus Transports](#data-bus-transports)
  - [Wallet Private Key](#wallet-private-key)
  - [Secrets from Files](#secrets-from-files)
  - [DSM v5 Delegation](#dsm-v5-delegation)
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

Several environment variables must be set for the daemon to function properly. These variables include Data Bus Transports settings, wallet private key, and Keys-API configuration.

### Data Bus Transports

#### EVM Chain transport

```env
...
PUBSUB_SERVICE=evm-chain

EVM_CHAIN_DATA_BUS_ADDRESS=<evm transport contract address>
EVM_CHAIN_DATA_BUS_PROVIDER_URL=<evm chain node url>
EVM_CHAIN_DATA_BUS_CHAIN_ID=<data bus chain id>
...
```

The EVM Chain transport sends transactions from the active delegate wallet.

### Wallet Private Key

```env
...
WALLET_PRIVATE_KEY=<wallet private key>
...
```

`WALLET_PRIVATE_KEY` is the current delegate key. Without it, the daemon
generates a random key. A random key works only with `DRY_RUN=true`.

### Secrets from Files

These values can come from a file: `WALLET_PRIVATE_KEY`,
`WALLET_PRIVATE_KEY_2`, `RPC_URL`, `PROVIDERS_URLS`,
`EVM_CHAIN_DATA_BUS_PROVIDER_URL`, `EVM_CHAIN_DATA_BUS_PROVIDERS_URLS`,
`KEYS_API_URL` and `KEYS_API_HOST`. Set `<NAME>_FILE` to the file path. The
file wins over the env value. The daemon trims white space around the value.
It fails at startup if the file is empty or a list file holds no URLs. A list
file holds URLs separated by commas or new lines. The daemon masks these values
in its logs.

```env
RPC_URL_FILE=/run/secrets/rpc-url
PROVIDERS_URLS_FILE=/run/secrets/providers-urls
```

### DSM v5 Delegation

```env
DELEGATION_CONTRACT_ADDRESS=<delegation contract address>
WALLET_PRIVATE_KEY=<current delegate private key>
WALLET_PRIVATE_KEY_2=<planned delegate private key>
```

`DELEGATION_CONTRACT_ADDRESS` is the DSM guardian identity for DSM v5.
`WALLET_PRIVATE_KEY` and `WALLET_PRIVATE_KEY_2` form the wallet pool: the
current delegate key and the planned next one. Do not add the owner key.

For every DSM v5 block snapshot, the daemon reads the effective delegate from
the delegation contract. It selects the matching key from the wallet pool.
After a rotation becomes active, the daemon switches to the new key without a
restart or config reload.

The daemon stops the cycle if no configured key matches, unless `DRY_RUN` is
enabled. It also stops if the delegate is revoked or the delegation contract
is terminated. Each delegate account needs enough ETH on the execution layer.
It also needs funds on the Data Bus chain.

### Dry Run

```env
DRY_RUN=true
```

In a dry run, the daemon syncs its caches, reads the guardian context and runs
every check. It signs messages locally, but it never publishes guardian
messages and never sends pause or unvet transactions. It does not need the
delegate key: if no configured key matches the active delegate, it signs with
the first wallet. All other checks of `DELEGATION_CONTRACT_ADDRESS` still
apply.

Only `true` and `false` are accepted; an empty value means `false`, the
default. Any other value fails config validation. Never enable it
on an active guardian: in a dry run the guardian does not pause, unvet or
attest deposits.

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

# Log level: debug, info, warn or error
LOG_LEVEL=info

# Log format: simple or json
LOG_FORMAT=simple

# Pubsub (default: evm-chain)
PUBSUB_SERVICE=evm-chain

# Data Bus
EVM_CHAIN_DATA_BUS_ADDRESS=
EVM_CHAIN_DATA_BUS_PROVIDER_URL=
EVM_CHAIN_DATA_BUS_CHAIN_ID=100

# Private key
# Used to sign transactions and stop the protocol.
# Make sure there are enough ETH on the balance to send a transaction to stop the protocol
WALLET_PRIVATE_KEY=0x0000000000000000000000000000000000000000000000000000000000000001

WALLET_PRIVATE_KEY_2=0x0000000000000000000000000000000000000000000000000000000000000002
DELEGATION_CONTRACT_ADDRESS=0x0000000000000000000000000000000000000004

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
      - WALLET_PRIVATE_KEY_2=${WALLET_PRIVATE_KEY_2}
      - DELEGATION_CONTRACT_ADDRESS=${DELEGATION_CONTRACT_ADDRESS}
      - KEYS_API_HOST=http://keys_api_service_api
      - KEYS_API_PORT=3001
      - PUBSUB_SERVICE=evm-chain
      - EVM_CHAIN_DATA_BUS_ADDRESS=${EVM_CHAIN_DATA_BUS_ADDRESS}
      - EVM_CHAIN_DATA_BUS_PROVIDER_URL=${EVM_CHAIN_DATA_BUS_PROVIDER_URL}
      - EVM_CHAIN_DATA_BUS_CHAIN_ID=${EVM_CHAIN_DATA_BUS_CHAIN_ID}
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

Use Node.js **24.22.3** and Yarn **1.22.22**:

```bash
nvm install
nvm use
yarn install --frozen-lockfile --non-interactive
yarn build
yarn typecheck
yarn lint
```

Dependencies use exact versions. See [dependency maintenance](docs/dependencies.md)
for security overrides and compatibility checks. The Docker runtime contains
production dependencies only. HTTP and HTTPS RPC requests use fresh connections.

### Copy env file for development and print your RPC_URL

```bash
cp develop.env ./.env
```

```diff
- RPC_URL=%NODE_URL%
+ RPC_URL=https://mainnet.infura.io/v3/***
```

### Starting the development environment (PostgreSQL, KAPI, Grafana, Prometheus)

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
Wallet balance and nonce metrics use the `delegateAddress` label. The label
changes when the effective DSM v5 delegate changes.

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

Fork e2e tests need an archive-capable Hoodi `RPC_URL` (chain ID 560048),
Docker, and a new test-only `WALLET_PRIVATE_KEY`. Set
`PROVIDERS_URLS=http://127.0.0.1:8545` and
`EVM_CHAIN_DATA_BUS_PROVIDER_URL=http://127.0.0.1:8545` so daemon calls use
the local Hardhat fork. The upstream RPC supplies read-only fork state.
Do not use a production wallet. `yarn test:e2e` runs the preflight first.
Missing historical state blocks the fork tests even when ordinary RPC reads work.
The EDF transition suite uses Hoodi block `3250000` and checks that the starting
DSM version is v4. The other suites fork the current head.

The suite pulls pinned Keys API and PostgreSQL images. It creates
`council-e2e-keys-api`, `council-e2e-pgdb` and `council-e2e-network`.
The database uses the Docker volume `council-e2e-pgdata-560048`. Tests stop these containers;
remove the stopped test containers when no longer needed. Keys API uses AMD64 emulation on ARM64 hosts.

## Release flow

To create a new release:

1. Merge all changes to the `main` branch.
1. After the merge, the `Prepare release draft` action will run automatically. When the action is complete, a release draft is created.
1. When you need to release, go to Repo → Releases.
1. Publish the desired release draft manually by clicking the edit button - this release is now the `Latest Published`.
1. After publication, the action to create a release bump will be triggered automatically.
