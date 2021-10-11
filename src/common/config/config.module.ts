import { DynamicModule, LoggerService, Module } from '@nestjs/common';
import { InMemoryConfiguration } from './in-memory-configuration';
import { Configuration } from './configuration';
import { validateOrReject } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

@Module({})
export class ConfigModule {
  static forRoot(): DynamicModule {
    return {
      module: ConfigModule,
      global: true,
      providers: [
        {
          provide: Configuration,
          useFactory: async (logger: LoggerService) => {
            const config = plainToClass(InMemoryConfiguration, process.env);
            try {
              await validateOrReject(config, {
                validationError: { target: false, value: false },
              });
              return config;
            } catch (validationErrors) {
              // eslint-disable-next-line @typescript-eslint/ban-types
              validationErrors.forEach((error: object) =>
                logger.error(`Bad environment variable(s): %o`, error),
              );
              process.exit(1);
            }
          },
          inject: [WINSTON_MODULE_NEST_PROVIDER],
        },
      ],
      exports: [Configuration],
    };
  }
}
