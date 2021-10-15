import { LoggerService, Module } from '@nestjs/common';
import { Kafka, logLevel } from 'kafkajs';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Configuration } from 'common/config';
import { TransportInterface } from './transport.interface';
import { KafkaTransport } from './kafka.transport';
import { KAFKA_LOG_PREFIX } from './kafka.constants';
import { WalletModule, WalletService } from '../wallet';

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
        if (config.PUBSUB_SERVICE !== 'kafka') {
          throw new Error(
            `Unsupported transport '${config.PUBSUB_SERVICE}'. Only 'kafka' transport is supported for now. Check '.env' file please.`,
          );
        }

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
              if (level === logLevel.ERROR) logger.error(prefix, log);
              if (level === logLevel.WARN) logger.warn(prefix, log);
              if (level === logLevel.INFO) logger.log(prefix, log);
              if (level === logLevel.DEBUG) logger.debug(prefix, log);
            };
          },
        });

        return new KafkaTransport(logger, kafka);
      },
      inject: [Configuration, WINSTON_MODULE_NEST_PROVIDER, WalletService],
    },
  ],
})
export class TransportModule {}
