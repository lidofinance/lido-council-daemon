import * as appRoot from 'app-root-path';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { DynamicModule, Module } from '@nestjs/common';
import { cleanSecrets } from '@lido-nestjs/logger';
import * as winston from 'winston';
import { InMemoryConfiguration } from './in-memory-configuration';
import { Configuration } from './configuration';
import { ValidationError } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { ConfigLoaderService } from './config-loader.service';
import { logMaskOptions } from './secrets';

dotenv.config({ path: resolve(appRoot.path, '.env') });

/**
 * The app logger depends on the config, so config errors go through this
 * separate logger. It writes JSON to stderr and masks the secrets.
 */
export const createConfigErrorLogger = (config: object): winston.Logger =>
  winston.createLogger({
    format: winston.format.combine(
      cleanSecrets(logMaskOptions(config)),
      winston.format.json(),
    ),
    transports: [new winston.transports.Console({ stderrLevels: ['error'] })],
  });

@Module({})
export class ConfigModule {
  static forRoot(): DynamicModule {
    return {
      module: ConfigModule,
      global: true,
      providers: [
        ConfigLoaderService,
        {
          provide: Configuration,
          useFactory: async (configLoaderService: ConfigLoaderService) => {
            const prepConfig = plainToClass(InMemoryConfiguration, process.env);
            try {
              if (prepConfig.NODE_ENV === 'test') {
                return prepConfig;
              }

              return await configLoaderService.loadSecrets(prepConfig);
            } catch (error) {
              const logger = createConfigErrorLogger(prepConfig);
              if (
                Array.isArray(error) &&
                error.every((e) => e instanceof ValidationError)
              ) {
                error.forEach((error: ValidationError) => {
                  logger.error('Bad environment variable', {
                    context: 'ConfigModule',
                    error,
                  });
                });
              } else {
                // A secret file that is missing, empty or unreadable
                logger.error('Cannot load the config', {
                  context: 'ConfigModule',
                  error,
                });
              }
              process.exit(1);
            }
          },
          inject: [ConfigLoaderService],
        },
      ],
      exports: [Configuration],
    };
  }
}
