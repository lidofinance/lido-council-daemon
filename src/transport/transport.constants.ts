import { StompOptions } from './stomp/stomp.interface';

export const KAFKA_LOG_PREFIX = 'Kafka';
export const RABBIT_LOG_PREFIX = 'RabbitMQ';
export const STOMP_OPTIONS: StompOptions = {
  reconnectAttempts: 2,
  reconnectTimeout: 5_000,
  maxWaitSocketSession: 100_000,
};
