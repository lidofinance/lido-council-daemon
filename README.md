## Lido Council Daemon

The daemon monitors the keys in the deposit contract and compares them with Lido's unused keys. The result of the comparison is signed with the private key and sent to the message broker. If the daemon finds a match, it tries to stop the deposits by sending a transaction calling the `pauseDeposits` method on the `Deposit Security Module` contract.

## Docker image

To build `lido/lido-council-daemon` docker image locally, simply run:

```bash
yarn docker:build
```

## Installation

Step 1. Copy the contents of `sample.env` to `.env` file

```bash
cp sample.env .env
```

Step 2. Change the following environment variables values in the previously created `.env` file:

```
...
KAFKA_USERNAME=<kafka username>
KAFKA_PASSWORD=<kafka password>
KAFKA_BROKER_ADDRESS_1=<kafka broker address with port>

WALLET_PRIVATE_KEY=<wallet private key>
...
```

Example:

```
...
KAFKA_USERNAME=john
KAFKA_PASSWORD=pemberton
KAFKA_BROKER_ADDRESS_1=dfv-32.confluent.kafka.cloud:9092

WALLET_PRIVATE_KEY=0x8da4ef21b864d2cc526dbdb2a120bd2874c36c9d0a1fb7f8c63d7f7a8b41de8f
...
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
$ yarn build
$ yarn start:prod
```

## Development

```bash
# development
$ yarn start

# watch mode
$ yarn start:dev
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
