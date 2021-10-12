import { LoggerService, Module } from '@nestjs/common';
import { ConfigModule } from '../common/config';
import { TransportInterface } from './transport.interface';
import { KafkaTransport } from './kafka.transport';
import { Kafka, logLevel } from 'kafkajs';
import { KAFKA_LOG_PREFIX } from './kafka.constants';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

export type SASLMechanism = 'plain' | 'scram-sha-256' | 'scram-sha-512';

@Module({
  imports: [ConfigModule],
  exports: [TransportInterface],
  providers: [
    {
      provide: TransportInterface,
      useClass: KafkaTransport,
    },
    {
      provide: Kafka,
      useFactory: async (
        configService: ConfigService,
        logger: LoggerService,
      ) => {
        return new Kafka({
          clientId: configService.get<string>('COUNCIL_ID'),
          brokers: [configService.get<string>('KAFKA_BROKER_1')],
          ssl: configService.get<boolean>('KAFKA_SSL'),
          sasl: {
            mechanism: configService.get<SASLMechanism>('KAFKA_SASL_MECHANISM'),
            username: configService.get<string>('KAFKA_USERNAME'),
            password: configService.get<string>('KAFKA_PASSWORD'),
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
      inject: [ConfigService, WINSTON_MODULE_NEST_PROVIDER],
    },
  ],
})
export class TransportModule {}
