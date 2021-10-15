import * as appRoot from 'app-root-path';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { DynamicModule, Module } from '@nestjs/common';
import { InMemoryConfiguration } from './in-memory-configuration';
import { Configuration } from './configuration';
import { validateOrReject } from 'class-validator';
import { plainToClass } from 'class-transformer';

dotenv.config({ path: resolve(appRoot.path, '.env') });

@Module({})
export class ConfigModule {
  static forRoot(): DynamicModule {
    return {
      module: ConfigModule,
      global: true,
      providers: [
        {
          provide: Configuration,
          useFactory: async () => {
            const config = plainToClass(InMemoryConfiguration, process.env);
            try {
              if (config.NODE_ENV === 'test') {
                return config;
              }

              await validateOrReject(config, {
                validationError: { target: false, value: false },
              });
              return config;
            } catch (validationErrors: any) {
              validationErrors.forEach((error: Record<string, unknown>) => {
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
          },
          inject: [],
        },
      ],
      exports: [Configuration],
    };
  }
}
