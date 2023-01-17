import { Injectable, LoggerService, Inject } from '@nestjs/common';
import { FetchService } from '@lido-nestjs/fetch';
import { AbortController } from 'node-abort-controller';
import { FETCH_REQUEST_TIMEOUT } from './keys-api.constants';
import { SRModuleKeysResponse, SRModuleListResponse } from './interfaces';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Configuration } from 'common/config';

@Injectable()
export class KeysApiService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) protected logger: LoggerService,
    protected readonly config: Configuration,
    protected readonly fetchService: FetchService,
  ) {}

  protected async fetch<Response>(url: string) {
    const controller = new AbortController();
    const { signal } = controller;

    const timer = setTimeout(() => {
      controller.abort();
    }, FETCH_REQUEST_TIMEOUT);

    const baseUrl = `${this.config.KEYS_API_HOST}:${this.config.KEYS_API_PORT}`;

    try {
      const res: Response = await this.fetchService.fetchJson(
        `${baseUrl}${url}`,
        {
          signal,
        },
      );
      clearTimeout(timer);
      return res;
    } catch (error) {
      clearTimeout(timer);
      throw error;
    }
  }

  public async getModulesList() {
    return await this.fetch<SRModuleListResponse>('/v1/modules');
  }

  public async getModuleKeys(stakingModuleId: number) {
    return await this.fetch<SRModuleKeysResponse>(
      `/v1/modules/${stakingModuleId}/keys`,
    );
  }
}
