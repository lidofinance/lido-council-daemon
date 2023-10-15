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
    const result = await this.fetch<SRModuleListResponse>('/v1/modules');
    if (!result.data?.length || !result.elBlockSnapshot)
      throw Error('Keys API not synced, please wait');
    return result;
  }

  public async getUnusedModuleKeys(stakingModuleId: number) {
    const result = await this.fetch<SRModuleKeysResponse>(
      `/v1/modules/${stakingModuleId}/keys?used=false`,
    );
    if (!result.data || !result.meta)
      throw Error('Keys API not synced, please wait');
    return {
      data: result.data as NonNullable<typeof result.data>,
      meta: result.meta as NonNullable<typeof result.meta>,
    };
  }
}
