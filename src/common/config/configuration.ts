import { createInterface } from '../di/functions/createInterface';
import { SASLMechanism } from '../../transport';

export const Configuration = createInterface<Configuration>('Configuration');

export type PubsubService = 'kafka' | 'libp2p';

export interface Configuration {
  NODE_ENV: string;
  PORT: number;
  LOG_LEVEL: string;
  LOG_FORMAT: string;
  RPC_URL: string;
  COUNCIL_ID: string;
  PUBSUB_SERVICE: PubsubService;
  KAFKA_BROKER_ADDRESS_1: string;
  KAFKA_BROKER_ADDRESS_2: string;
  KAFKA_SSL: boolean;
  KAFKA_SASL_MECHANISM: SASLMechanism;
  KAFKA_USERNAME: string;
  KAFKA_PASSWORD: string;
}
