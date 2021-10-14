## Lido Council Daemon

The daemon monitors the keys in the deposit contract and compares them with Lido's unused keys. The result of the comparison is signed with the private key and sent to the message broker. If the daemon finds a match, it tries to stop the deposits by sending a transaction calling the `pauseDeposits` method on the `Deposit Security Module` contract.

## Docker image

TODO

## Installation

Step 1. Copy the contents of sample.env to .env

```bash
cp sample.env .env
```

Step 2. Fill out the `.env` file. These variables are important:

```
KAFKA_USERNAME
KAFKA_PASSWORD
KAFKA_BROKER_ADDRESS_1

WALLET_PRIVATE_KEY
```

Step 3. Install dependencies

```bash
$ yarn install
```

Step 4. Generate types from ABI

```bash
$ yarn typechain
```

## Running the app

```bash
# development
$ yarn start

# watch mode
$ yarn start:dev

# production mode
$ yarn start:prod
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
