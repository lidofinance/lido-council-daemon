import { Injectable, LoggerService, Inject } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Configuration } from 'common/config';
import { KeysApiService } from 'keys-api/keys-api.service';
import { StakingModuleData } from 'guardian';
import { getVettedUnusedKeys } from './vetted-keys';
import { RegistryOperator } from 'keys-api/interfaces/RegistryOperator';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { SRModule } from 'keys-api/interfaces';
import { InconsistentLastChangedBlockHash } from 'common/custom-errors';
import { GroupedByModuleOperatorListResponse } from 'keys-api/interfaces/GroupedByModuleOperatorListResponse';

@Injectable()
export class StakingRouterService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) protected logger: LoggerService,
    protected readonly config: Configuration,
    protected readonly keysApiService: KeysApiService,
  ) {}

  public getVettedKeys(
    operators: RegistryOperator[],
    unusedKeys: RegistryKey[],
  ): RegistryKey[] {
    return operators.flatMap((operator) => {
      const operatorKeys = unusedKeys
        .filter(
          (key) =>
            key.operatorIndex === operator.index &&
            key.moduleAddress == operator.moduleAddress,
        )
        .sort((a, b) => a.index - b.index)
        .slice(0, operator.stakingLimit);

      return operatorKeys;
    });
  }

  public isEqualLastChangedBlockHash(
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

  public async getKeysByPubkeys(pubkeys: string[]) {
    return await this.keysApiService.getKeysByPubkeys(pubkeys);
  }
}
