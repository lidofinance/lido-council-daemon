import { createInterface } from '../di/functions/createInterface';
import { SASLMechanism } from '../../transport';
import { ethers } from 'ethers';

export const Configuration = createInterface<Configuration>('Configuration');

export type PubsubService = 'rabbitmq' | 'kafka' | 'evm-chain';

export interface Configuration {
  NODE_ENV: string;
  PORT: number;
  LOG_LEVEL: string;
  LOG_FORMAT: string;
  RPC_URL: string;
  WALLET_PRIVATE_KEY: string;
  WALLET_PRIVATE_KEY_FILE: string;
  PUBSUB_SERVICE: PubsubService;
  KAFKA_CLIENT_ID: string;
  BROKER_TOPIC: string;
  KAFKA_BROKER_ADDRESS_1: string;
  KAFKA_BROKER_ADDRESS_2: string;
  KAFKA_SSL: boolean;
  KAFKA_SASL_MECHANISM: SASLMechanism;
  KAFKA_USERNAME: string;
  KAFKA_PASSWORD: string;
  RABBITMQ_URL: string;
  RABBITMQ_LOGIN: string;
  RABBITMQ_PASSCODE: string;
  RABBITMQ_PASSCODE_FILE: string;
  REGISTRY_KEYS_QUERY_BATCH_SIZE: number;
  REGISTRY_KEYS_QUERY_CONCURRENCY: number;
  KEYS_API_PORT: number;
  KEYS_API_HOST: string;
  KEYS_API_URL: string;
  LOCATOR_DEVNET_ADDRESS: string;
  WALLET_MIN_BALANCE: ethers.BigNumber;
  WALLET_CRITICAL_BALANCE: ethers.BigNumber;
  EVM_CHAIN_DATA_BUS_ADDRESS: string;
  EVM_CHAIN_DATA_BUS_PROVIDER_URL: string;
  EVM_CHAIN_DATA_BUS_WALLET_MIN_BALANCE: ethers.BigNumber;
}
