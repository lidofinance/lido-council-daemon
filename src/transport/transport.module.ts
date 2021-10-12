import { LoggerService, Module } from '@nestjs/common';
import { Kafka, logLevel } from 'kafkajs';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Configuration } from 'common/config';
import { TransportInterface } from './transport.interface';
import { KafkaTransport } from './kafka.transport';
import { KAFKA_LOG_PREFIX } from './kafka.constants';

export type SASLMechanism = 'plain' | 'scram-sha-256' | 'scram-sha-512';

@Module({
  exports: [TransportInterface],
  providers: [
    {
      provide: TransportInterface,
      useClass: KafkaTransport,
    },
    {
      provide: Kafka,
      useFactory: async (config: Configuration, logger: LoggerService) => {
        return new Kafka({
          clientId: config.COUNCIL_ID,
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
      },
      inject: [Configuration, WINSTON_MODULE_NEST_PROVIDER],
    },
  ],
})
export class TransportModule {}
