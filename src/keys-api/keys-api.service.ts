import { Injectable, LoggerService, Inject } from '@nestjs/common';
import { FetchService, RequestInit } from '@lido-nestjs/fetch';
import { AbortController } from 'node-abort-controller';
import { FETCH_REQUEST_TIMEOUT } from './keys-api.constants';
import { KeyListResponse, Status } from './interfaces';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Configuration } from 'common/config';
import { GroupedByModuleOperatorListResponse } from './interfaces/GroupedByModuleOperatorListResponse';
import { InconsistentLastChangedBlockHash } from 'common/custom-errors';
import { SRModuleListResponse } from './interfaces/SRModuleListResponse';

@Injectable()
export class KeysApiService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) protected logger: LoggerService,
    protected readonly config: Configuration,
    protected readonly fetchService: FetchService,
  ) {}

  private getBaseUrl() {
    const baseUrl =
      this.config.KEYS_API_URL ||
      `${this.config.KEYS_API_HOST}:${this.config.KEYS_API_PORT}`;
    return baseUrl;
  }

  protected async fetch<Response>(url: string, requestInit?: RequestInit) {
    const controller = new AbortController();
    const { signal } = controller;

    const timer = setTimeout(() => {
      controller.abort();
    }, FETCH_REQUEST_TIMEOUT);

    const baseUrl = this.getBaseUrl();
    try {
      const res: Response = await this.fetchService.fetchJson(
        `${baseUrl}${url}`,
        {
          signal,
          ...requestInit,
        },
      );

      clearTimeout(timer);
      return res;
    } catch (error: any) {
      clearTimeout(timer);
      this.logger.error('Keys API request error', {
        url: `${baseUrl}${url}`,
        error,
      });
      throw error;
    }
  }

  /**
   * The /v1/keys/find API endpoint returns keys along with their duplicates
   */
  public async getKeysByPubkeys(pubkeys: string[]) {
    const result = await this.fetch<KeyListResponse>(`/v1/keys/find`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ pubkeys }),
    });
    return result;
  }

  public async getOperatorListWithModule() {
    const result = await this.fetch<GroupedByModuleOperatorListResponse>(
      `/v1/operators`,
    );
    return result;
  }

  /**
   * @param The /v1/status API endpoint returns chainId, appVersion, El and Cl meta
   * @returns
   */
  public async getKeysApiStatus(): Promise<Status> {
    const result = await this.fetch<Status>(`/v1/status`);
    return result;
  }

  /**
   * The /v1/keys endpoint returns full list of keys
   */
  public async getKeys() {
    const result = await this.fetch<KeyListResponse>(`/v1/keys`);
    return result;
  }

  public async getModules() {
    const result = await this.fetch<SRModuleListResponse>(`/v1/modules`);
    return result;
  }

  /**
   * Verifies the consistency of metadata by comparing hashes.
   * @param firstRequestHash - Hash of the first request
   * @param secondRequestHash - Hash of the second request
   */
  public verifyMetaDataConsistency(
    firstRequestHash: string,
    secondRequestHash: string,
  ) {
    if (firstRequestHash !== secondRequestHash) {
      const error =
        'Since the last request, data in Kapi has been updated. This may result in inconsistencies between the data from two separate requests.';

      this.logger.error(error, { firstRequestHash, secondRequestHash });

      throw new InconsistentLastChangedBlockHash();
    }
  }
}
