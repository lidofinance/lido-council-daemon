import { Injectable } from '@nestjs/common';
import { OneAtTime, StakingModuleId } from 'common/decorators';
import { SecurityService } from 'contracts/security';
import { GuardianMessageService } from 'guardian/guardian-message';
import { BlockData, StakingModuleData } from 'guardian/interfaces';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { packNodeOperatorIds, packVettedSigningKeysCounts } from './bytes';

@Injectable()
export class UnvettingService {
  constructor(
    private securityService: SecurityService,
    private guardianMessageService: GuardianMessageService,
  ) {}
  /**
   * keys of one module
   */
  @OneAtTime()
  async handleUnvetting(
    @StakingModuleId stakingModuleId: number,
    stakingModuleData: StakingModuleData,
    blockData: BlockData,
  ) {
    const keys = [
      ...stakingModuleData.invalidKeys,
      ...stakingModuleData.duplicatedKeys,
      ...stakingModuleData.frontRunKeys,
    ];

    const maxOperatorsPerUnvetting = await this.getMaxOperatorsPerUnvetting();
    const chunks = this.getNewVettedAmount(keys, maxOperatorsPerUnvetting);

    Promise.all(
      chunks.map(async ({ operatorIds, vettedKeysByOperator }) => {
        const signature = await this.securityService.signUnvetData(
          stakingModuleData.nonce,
          blockData.blockNumber,
          blockData.blockHash,
          stakingModuleId,
          operatorIds,
          vettedKeysByOperator,
        );

        this.securityService.unvetSigningKeys(
          stakingModuleData.nonce,
          blockData.blockNumber,
          blockData.blockHash,
          stakingModuleId,
          operatorIds,
          vettedKeysByOperator,
          signature,
        );

        this.guardianMessageService.sendUnvetMessage({
          nonce: stakingModuleData.nonce,
          blockNumber: blockData.blockNumber,
          blockHash: blockData.blockHash,
          guardianAddress: blockData.guardianAddress,
          guardianIndex: blockData.guardianIndex,
          stakingModuleId,
          operatorIds,
          vettedKeysByOperator,
          signature,
        });
      }),
    );
  }

  async getMaxOperatorsPerUnvetting() {
    return await this.securityService.getMaxOperatorsPerUnvetting();
  }

  getNewVettedAmount(
    keysForUnvetting: RegistryKey[],
    maxOperatorsPerUnvetting: number,
  ): {
    operatorIds: string;
    vettedKeysByOperator: string;
  }[] {
    const operatorNewVettedAmount = new Map<number, number>();

    keysForUnvetting.forEach(({ operatorIndex, index }) => {
      // vettedAmount is the smallest index of keys in list
      const vettedAmount = operatorNewVettedAmount.get(operatorIndex);
      if (vettedAmount === undefined || vettedAmount > index) {
        operatorNewVettedAmount.set(operatorIndex, index);
      }
    });

    const operatorIds = Array.from(operatorNewVettedAmount.keys());
    const vettedKeysByOperator = Array.from(operatorNewVettedAmount.values());

    const chunks: { operatorIds: string; vettedKeysByOperator: string }[] = [];
    for (let i = 0; i < operatorIds.length; i += maxOperatorsPerUnvetting) {
      const chunkOperatorIds = operatorIds.slice(
        i,
        i + maxOperatorsPerUnvetting,
      );

      const chunkVettedKeysByOperator = vettedKeysByOperator.slice(
        i,
        i + maxOperatorsPerUnvetting,
      );

      chunks.push({
        operatorIds: packNodeOperatorIds(chunkOperatorIds),
        vettedKeysByOperator: packVettedSigningKeysCounts(
          chunkVettedKeysByOperator,
        ),
      });
    }

    return chunks;
  }
}
