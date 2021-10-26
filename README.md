## Lido Council Daemon

The daemon monitors the keys in the deposit contract and compares them with Lido's unused keys. The result of the comparison is signed with the private key and sent to the message broker. If the daemon finds a match, it tries to stop the deposits by sending a transaction calling the `pauseDeposits` method on the `Deposit Security Module` contract.

## Running the app

There are several ways to run a daemon:

### 1. Use image from Docker hub

You can pull image from dockerhub and run it manually or via docker-compose
(`docker-compose.yml` can be found in repository root).
Volumes can be omitted if needed.

```bash
docker pull lidofinance/lido-council-daemon@sha256:0c8c0ad35dce705b0b978a653fc4cf1756e23f599fabbde73c801576bad8b4c4

docker run -i -t \
  -v ${PWD}/.volumes/council/cache:/council/cache/ \
  -p 3000:3000/tcp \
  -e PORT='3000' \
  -e LOG_LEVEL='debug' \
  -e LOG_FORMAT='simple' \
  -e RPC_URL='<rpc url>' \
  -e KAFKA_SSL='true' \
  -e KAFKA_SASL_MECHANISM='plain' \
  -e KAFKA_USERNAME='<kafka user>' \
  -e KAFKA_PASSWORD='<kafka password>' \
  -e KAFKA_BROKER_ADDRESS_1='<kafka address>' \
  -e KAFKA_TOPIC=defender \
  -e WALLET_PRIVATE_KEY \
  lidofinance/lido-council-daemon@sha256:0c8c0ad35dce705b0b978a653fc4cf1756e23f599fabbde73c801576bad8b4c4
```

### 2. Build Docker image locally

To build `lidofinance/lido-council-daemon` docker image locally, simply run:

```bash
yarn docker:build
```

### 3. Build the app locally

Step 1. Copy the contents of `sample.env` to `.env` file

```bash
cp sample.env .env
```

Step 2. Change the environment variables values in the previously created `.env` file. Read more in the [environment variables](#environment-variables) section

Step 3. Install dependencies

```bash
$ yarn install
```

Step 4. Generate types from ABI

```bash
$ yarn typechain
```

Step 5. Build the app

```bash
$ yarn build
```

Step 6. Run the app

```bash
$ yarn start:prod
```

## Environment variables

The following variables are required for the daemon to work:

### Kafka

```
...
KAFKA_USERNAME=<kafka username>
KAFKA_PASSWORD=<kafka password>
KAFKA_BROKER_ADDRESS_1=<kafka broker address with port>
...
```

### Wallet private key

```
...
WALLET_PRIVATE_KEY=<wallet private key>
...
```

The private key can be omitted, in which case a random key will be generated and the daemon will run in test mode. But in production it is required.

The account balance should have some ETH to send transactions. In regular mode, the daemon does not spend any funds. The transaction will be sent only if a potential attack is detected. 1 ETH is enough.

### Example

```
...
KAFKA_USERNAME=john
KAFKA_PASSWORD=pemberton
KAFKA_BROKER_ADDRESS_1=dfv-32.confluent.kafka.cloud:9092

WALLET_PRIVATE_KEY=0x8da4ef21b864d2cc526dbdb2a120bd2874c36c9d0a1fb7f8c63d7f7a8b41de8f
...
```

## Logs

On startup, the daemon checks if the provided wallet address belongs to the list of guardians, as well as account balance. If something goes wrong you will see warnings:

```
warn: Private key is not provided, a random address will be generated for the test run
warn: Account balance is too low {"balance":"1.0 ETH"}
warn: Your address is not in the Guardian List {"address":"0x0000000000000000000000000000000000000000"}
```

If all goes well, it will be in the logs:

```
info: Account balance is sufficient {"balance":"1.0 ETH"}
info: You address is in the Guardian List {"address":"0x0000000000000000000000000000000000000000"}
```

At the first startup the daemon will collect historical data:

```
info: Historical events are fetched {"endBlock":4487322,"events":3,"startBlock":4467323}
```

If the daemon works correctly, the logs will look like this:

```
2021-10-16 11:05:20 debug: Fresh events are fetched {"startBlock":5679826,"endBlock":5679976,"events":6}
2021-10-16 11:05:35 debug: Fresh events are fetched {"startBlock":5679827,"endBlock":5679977,"events":6}
2021-10-16 11:05:52 debug: Fresh events are fetched {"startBlock":5679828,"endBlock":5679978,"events":7}
2021-10-16 11:05:53 info: No problems found {"type":"deposit","depositRoot":"0xc2c9308fa425a64ef9cac1837412ba462b6429fce2f170184284a260b735638c","keysOpIndex":12,"blockNumber":5679978,"blockHash":"0x87762c941f653f2f70157f86deac78f19e4d1549e231a52d1191289592d1a0ab","guardianAddress":"0x3dc4cF780F2599B528F37dedB34449Fb65Ef7d4A","guardianIndex":0,"signature":{"r":"0x44fec2e6fd34e74b8f001ef0e5bbd2db6d3179925fb82cb43231e19af46f0ddd","s":"0x2ff4326af760e353803458b75279eb8f58e5735b3565ea16bcd0f773bce106a4","_vs":"0xaff4326af760e353803458b75279eb8f58e5735b3565ea16bcd0f773bce106a4","recoveryParam":1,"v":28}}
2021-10-16 11:06:03 debug: Fresh events are fetched {"startBlock":5679829,"endBlock":5679979,"events":7}
```

## Development

```bash
# development
$ yarn start

# watch mode
$ yarn start:dev
```

## Prometheus metrics

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
