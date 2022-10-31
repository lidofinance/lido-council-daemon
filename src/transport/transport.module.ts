import { LoggerService, Module } from '@nestjs/common';
import { Kafka, logLevel } from 'kafkajs';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Configuration } from 'common/config';
import { TransportInterface } from './transport.interface';
import { KafkaTransport } from './kafka/kafka.transport';
import { KAFKA_LOG_PREFIX, RABBIT_LOG_PREFIX } from './kafka/kafka.constants';
import { WalletModule, WalletService } from '../wallet';
import StompClient from './stomp/stomp.client';

import StompTransport from './stomp/stomp.transport';
import { StompException } from './stomp/stomp.exceptions';

export type SASLMechanism = 'plain' | 'scram-sha-256' | 'scram-sha-512';

@Module({
  exports: [TransportInterface],
  imports: [WalletModule],
  providers: [
    {
      provide: TransportInterface,
      useFactory: async (
        config: Configuration,
        logger: LoggerService,
        walletService: WalletService,
      ) => {
        if (config.PUBSUB_SERVICE == 'kafka') {
          const kafka = new Kafka({
            clientId: config.KAFKA_CLIENT_ID || walletService.address,
            brokers: [config.KAFKA_BROKER_ADDRESS_1],
            ssl: config.KAFKA_SSL,
            sasl: {
              mechanism: config.KAFKA_SASL_MECHANISM,
              username: config.KAFKA_USERNAME,
              password: config.KAFKA_PASSWORD,
            },
            logCreator: () => {
              return ({ log, level }) => {
                const prefix = KAFKA_LOG_PREFIX;
                if (level === logLevel.ERROR) logger.error(log);
                if (level === logLevel.WARN) logger.warn(prefix, log);
                if (level === logLevel.INFO) logger.log(prefix, log);
                if (level === logLevel.DEBUG) logger.debug?.(prefix, log);
              };
            },
          });

          return new KafkaTransport(logger, kafka);
        } else if (config.PUBSUB_SERVICE == `rabbitmq`) {
          const stompClient = new StompClient(
            config.RABBITMQ_URL,
            config.RABBITMQ_LOGIN,
            config.RABBITMQ_PASSCODE,
            (frame) => {
              logger.log(RABBIT_LOG_PREFIX, frame.body);
            },
            (frame) => {
              logger.error(RABBIT_LOG_PREFIX, frame.body);
              throw new StompException(`Stomp error. ${frame.body}`);
            },
          );

          return new StompTransport(stompClient);
        }
      },
      inject: [Configuration, WINSTON_MODULE_NEST_PROVIDER, WalletService],
    },
  ],
})
export class TransportModule {}
