import { LoggerService, Module } from '@nestjs/common';
import { Kafka, logLevel } from 'kafkajs';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Configuration } from 'common/config';
import { TransportInterface } from './transport.interface';
import { KafkaTransport } from './kafka/kafka.transport';
import {
  KAFKA_LOG_PREFIX,
  RABBIT_LOG_PREFIX,
  STOMP_OPTIONS,
} from './transport.constants';
import { WalletModule, WalletService } from '../wallet';
import StompClient from './stomp/stomp.client';

import StompTransport from './stomp/stomp.transport';
import { DataBusTransport } from './data-bus/data-bus.transport';
import { DataBusModule, DataBusService } from 'contracts/data-bus';

export type SASLMechanism = 'plain' | 'scram-sha-256' | 'scram-sha-512';

@Module({
  exports: [TransportInterface],
  imports: [WalletModule, DataBusModule.register()],
  providers: [
    {
      provide: TransportInterface,
      useFactory: async (
        config: Configuration,
        logger: LoggerService,
        walletService: WalletService,
        dataBusService: DataBusService,
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
          const stompClient = new StompClient({
            url: config.RABBITMQ_URL,
            login: config.RABBITMQ_LOGIN,
            passcode: config.RABBITMQ_PASSCODE,
            connectCallback: () => {
              logger.log(RABBIT_LOG_PREFIX, 'RabbitMQ connected successfully.');
            },
            errorCallback: (frame) => {
              logger.error('STOMP error', frame);
            },
            logger,
            options: STOMP_OPTIONS,
          });

          const transport = new StompTransport(stompClient);

          stompClient.connect()?.catch((error) => {
            logger.error('STOMP connection error', error);
          });

          return transport;
        } else if (config.PUBSUB_SERVICE == 'evm-chain') {
          const dataBus = new DataBusTransport(logger, dataBusService);
          await dataBus.initialize();
          return dataBus;
        }
      },
      inject: [
        Configuration,
        WINSTON_MODULE_NEST_PROVIDER,
        WalletService,
        DataBusService,
      ],
    },
  ],
})
export class TransportModule {}
