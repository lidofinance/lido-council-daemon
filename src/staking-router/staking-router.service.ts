import { Injectable, LoggerService, Inject } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Configuration } from 'common/config';
import { KeysApiService } from 'keys-api/keys-api.service';
import { SRModuleKeysResponse, SRModule } from 'keys-api/interfaces';

@Injectable()
export class StakingRouterService {
  protected stakingRouterCache: Record<number, SRModuleKeysResponse> = {};
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) protected logger: LoggerService,
    protected readonly config: Configuration,
    protected readonly keysApiService: KeysApiService,
  ) {}

  public async getStakingModules() {
    return await this.keysApiService.getModulesList();
  }

  public async getStakingModuleUnusedKeys(
    blockHash: string,
    { id, nonce }: SRModule,
  ) {
    if (!this.isNeedToUpdateState(id, nonce))
      return this.getStakingRouterKeysCache(id);

    const srResponse = await this.keysApiService.getUnusedModuleKeys(id);
    const srModuleBlockHash = srResponse.meta.elBlockSnapshot.blockHash;

    if (srModuleBlockHash !== blockHash) {
      this.logger.log('Blockhash of the received keys', {
        srModuleBlockHash,
        blockHash,
      });

      throw Error(
        'Blockhash of the received keys does not match the current blockhash',
      );
    }

    this.setStakingRouterCache(id, srResponse);

    return srResponse;
  }

  protected getStakingRouterKeysCache(stakingModuleId: number) {
    return this.stakingRouterCache[stakingModuleId];
  }

  protected setStakingRouterCache(
    stakingModuleId: number,
    srResponse: SRModuleKeysResponse,
  ) {
    this.stakingRouterCache[stakingModuleId] = srResponse;
  }

  protected isNeedToUpdateState(stakingModuleId: number, nextNonce: number) {
    const cache = this.getStakingRouterKeysCache(stakingModuleId);
    if (!cache) return true;

    const prevNonce = cache.data.module.nonce;
    return prevNonce !== nextNonce;
  }
}
