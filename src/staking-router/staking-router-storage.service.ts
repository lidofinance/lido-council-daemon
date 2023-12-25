import { Injectable, LoggerService, Inject } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Configuration } from 'common/config';
import { KeysApiService } from 'keys-api/keys-api.service';
import { StakingModuleData } from 'guardian';
import { getVettedUnusedKeys } from './vetted-keys';
import { RegistryOperator } from 'keys-api/interfaces/RegistryOperator';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { SRModule } from 'keys-api/interfaces';
import { Meta } from 'keys-api/interfaces/Meta';
import { InconsistentLastChangedBlockHash } from 'common/custom-errors';
import { SROperatorListWithModule } from 'keys-api/interfaces/SROperatorListWithModule';
import { ELBlockSnapshot } from 'keys-api/interfaces/ELBlockSnapshot';

type UpdatedData = {
  operatosByModules: SROperatorListWithModule;
  unusedKeys: 
  meta: Meta;

}

@Injectable()
export class StakingRouterService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) protected logger: LoggerService,
    protected readonly config: Configuration,
    protected readonly keysApiService: KeysApiService,
  ) {}

  protected stakingRouterCache: Record<number, StakingModuleData> = {};


  async fetchData() {
    // fetch operators and modules
    const { data: operatorsByModules, meta } =
      await this.keysApiService.getOperatorListWithModule();

    const result = operatorsByModules.filter(({ module: stakingModule }) => {
      const cacheLastChangedBlockHash =
        this.stakingRouterCache[stakingModule.id].lastChangedBlockHash;

      return cacheLastChangedBlockHash !== stakingModule.lastChangedBlockHash
        ? true
        : false;
    });

  }

  async fetchOperatorsAndModules() {

  }


}