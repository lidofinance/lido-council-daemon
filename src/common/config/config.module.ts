import * as appRoot from 'app-root-path';
import * as dotenv from 'dotenv';
import { resolve } from 'path';
import { DynamicModule, Module } from '@nestjs/common';
import { InMemoryConfiguration } from './in-memory-configuration';
import { Configuration } from './configuration';
import { validateOrReject, ValidationError } from 'class-validator';
import { plainToClass } from 'class-transformer';
import { readFile } from 'fs/promises';

dotenv.config({ path: resolve(appRoot.path, '.env') });

@Module({})
export class ConfigModule {
  static async loadEnvOrFile(
    config: InMemoryConfiguration,
    envName: string,
  ): Promise<string> {
    // ENV should be non empty string
    if (config[envName]) {
      return config[envName];
    }

    const envVarFile = envName + '_FILE';
    const filePath = config[envVarFile];

    try {
      const fileContent = (await readFile(filePath, 'utf-8'))
        .toString()
        .replace(/(\r\n|\n|\r)/gm, '');

      delete config[envVarFile];
      return fileContent;
    } catch (error) {
      const errorCode = (error as any).code;

      switch (errorCode) {
        case 'ENOENT':
          throw new Error(`Failed to load ENV variable from the ${envVarFile}`);
        case 'EACCES':
          throw new Error(
            `Permission denied when trying to read the file specified by ${envVarFile}`,
          );
        case 'EMFILE':
          throw new Error(
            `Too many open files in the system when trying to read the file specified by ${envVarFile}`,
          );
        default:
          throw error;
      }
    }
  }

  static async loadSecrets(
    config: InMemoryConfiguration,
  ): Promise<InMemoryConfiguration> {
    config.RABBITMQ_PASSCODE = await this.loadEnvOrFile(
      config,
      'RABBITMQ_PASSCODE',
    );
    config.WALLET_PRIVATE_KEY = await this.loadEnvOrFile(
      config,
      'WALLET_PRIVATE_KEY',
    );

    await validateOrReject(config, {
      validationError: { target: false, value: false },
    });

    return config;
  }

  static forRoot(): DynamicModule {
    return {
      module: ConfigModule,
      global: true,
      providers: [
        {
          provide: Configuration,
          useFactory: async () => {
            const prepConfig = plainToClass(InMemoryConfiguration, process.env);
            try {
              if (prepConfig.NODE_ENV === 'test') {
                return prepConfig;
              }

              await validateOrReject(prepConfig, {
                validationError: { target: false, value: false },
              });

              return await this.loadSecrets(prepConfig);
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
          inject: [],
        },
      ],
      exports: [Configuration],
    };
  }
}
