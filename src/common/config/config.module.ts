import * as appRoot from 'app-root-path';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { DynamicModule, Module } from '@nestjs/common';
import { InMemoryConfiguration } from './in-memory-configuration';
import { Configuration } from './configuration';
import { validateOrReject, ValidationError } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { ConfigLoaderService } from './config-loader.service';

dotenv.config({ path: resolve(appRoot.path, '.env') });

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

              await validateOrReject(prepConfig, {
                validationError: { target: false, value: false },
              });

              return await configLoaderService.loadSecrets(prepConfig);
            } catch (error) {
              // handling the validation error of the configs
              if (
                Array.isArray(error) &&
                error.every((e) => e instanceof ValidationError)
              ) {
                error.forEach((error: Record<string, unknown>) => {
                  const jsonError = JSON.stringify({
                    context: 'ConfigModule',
                    message: 'Bad environment variable(s): %o`',
                    level: 'error',
                    error,
                  });
                  console.error(jsonError);
                });
                process.exit(1);
              }
              // discard the exception if the error is not a validator error
              throw error;
            }
          },
          inject: [ConfigLoaderService],
        },
      ],
      exports: [Configuration],
    };
  }
}
