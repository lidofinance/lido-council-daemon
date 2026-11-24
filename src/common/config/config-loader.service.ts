import { Injectable } from '@nestjs/common';
import { readFile } from 'fs/promises';

import { InMemoryConfiguration } from './in-memory-configuration';
import { validateOrReject } from 'class-validator';
import { parseUrlList, SECRET_ENVS, URL_LIST_ENVS } from './secrets';

@Injectable()
export class ConfigLoaderService {
  public async readFile(filePath: string) {
    return await readFile(filePath, 'utf-8');
  }

  public async loadFile(filePath: string, envVarFile: string) {
    let fileContent: string;
    try {
      fileContent = (await this.readFile(filePath)).toString().trim();
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

    if (fileContent === '') {
      throw new Error(`${envVarFile} points to an empty file`);
    }

    return fileContent;
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
    for (const name of SECRET_ENVS) {
      const value = await this.loadEnvOrFile(config, name);
      const fromFile = Boolean(config[`${name}_FILE`]);
      if (!fromFile || !URL_LIST_ENVS.includes(name)) {
        config[name as string] = value;
        continue;
      }

      const urls = parseUrlList(value);
      if (!urls) {
        throw new Error(`${name}_FILE holds no URLs`);
      }
      config[name as string] = urls;
    }

    await validateOrReject(config, {
      validationError: { target: false, value: false },
    });

    return config;
  }
}
