#!/bin/bash

docker compose -f docker-compose.e2e-v3.yml up -d hardhat_node e2e_pgdb

echo "Running cutKeys script via ts-node..."
npx ts-node test/helpers/wait-node-cut-keys.ts &> keycutting.log &

echo "Waiting for Key cutting to complete..."
tail -f keycutting.log | while read LOG_LINE
do
   if [[ "${LOG_LINE}" == *"Key cutting completed."* ]]; then
      echo "Key cutting process completed!"
      pkill -P $$ tail
   fi
done

echo "Key cutting completed. Starting e2e_keys_api..."
docker compose -f docker-compose.e2e-v3.yml up -d e2e_keys_api

echo "Waiting for e2e_keys_api to be ready..."
until [ "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/v1/modules)" == "200" ]; do
  echo "e2e_keys_api is not ready yet. Retrying..."
  sleep 5
done

echo "e2e_keys_api is ready."
