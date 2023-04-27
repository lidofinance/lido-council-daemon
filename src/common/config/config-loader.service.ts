import { Injectable } from '@nestjs/common';
import { readFile } from 'fs/promises';

import { InMemoryConfiguration } from './in-memory-configuration';
import { validateOrReject } from 'class-validator';

@Injectable()
export class ConfigLoaderService {
  public async readFile(filePath: string) {
    return await readFile(filePath, 'utf-8');
  }

  public async loadFile(filePath: string, envVarFile: string) {
    try {
      const fileContent = (await this.readFile(filePath))
        .toString()
        .replace(/(\r\n|\n|\r)/gm, '');
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

  public async loadEnvOrFile(
    config: InMemoryConfiguration,
    envName: string,
  ): Promise<string> {
    const envVarFile = envName + '_FILE';
    const filePath = config[envVarFile];

    if (filePath) {
      return await this.loadFile(filePath, envVarFile);
    }

    return config[envName];
  }

  public async loadSecrets(
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
}
