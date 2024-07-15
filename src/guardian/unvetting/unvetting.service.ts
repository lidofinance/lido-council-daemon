import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { SecurityService } from 'contracts/security';
import { GuardianMessageService } from 'guardian/guardian-message';
import { BlockData, StakingModuleData } from 'guardian/interfaces';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { packNodeOperatorIds, packVettedSigningKeysCounts } from './bytes';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { OneAtTime, StakingModuleId } from 'common/decorators';

type UnvetData = { operatorIds: string; vettedKeysByOperator: string };

@Injectable()
export class UnvettingService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private securityService: SecurityService,
    private guardianMessageService: GuardianMessageService,
  ) {}

  /**
   * Unvet invalid, duplicated, front-runned keys. Sending transaction in Security contract, sending messages in broker
   */
  async handleUnvetting(
    stakingModuleData: StakingModuleData,
    blockData: BlockData,
  ) {
    if (blockData.securityVersion !== 3) {
      return;
    }

    const keys = [
      ...stakingModuleData.invalidKeys,
      ...stakingModuleData.duplicatedKeys,
      ...stakingModuleData.frontRunKeys,
    ];

    if (!keys.length) {
      // TODO: change log to emphasis that we dont have keys for unvetting
      this.logger.log('Did not find keys for unvetting. Keys are correct.', {
        stakingModuleId: stakingModuleData.stakingModuleId,
      });
      return;
    }

    const maxOperatorsPerUnvetting = await this.getMaxOperatorsPerUnvetting();
    const operatorNewVettedAmount = this.findNewVettedAmount(keys);
    const chunks = this.packByChunks(
      operatorNewVettedAmount,
      maxOperatorsPerUnvetting,
    );

    this.unvetSignKeysChunk(
      stakingModuleData,
      stakingModuleData.stakingModuleId,
      blockData,
      chunks,
    ).catch((error) => this.logger.error(error));
  }

  @OneAtTime()
  async unvetSignKeysChunk(
    stakingModuleData: StakingModuleData,
    @StakingModuleId stakingModuleId: number,
    blockData: BlockData,
    chunks: UnvetData[],
  ) {
    // TODO: send only one chunk
    await Promise.all(
      chunks.map(async ({ operatorIds, vettedKeysByOperator }) => {
        const signature = await this.securityService.signUnvetData(
          stakingModuleData.nonce,
          blockData.blockNumber,
          blockData.blockHash,
          stakingModuleId,
          operatorIds,
          vettedKeysByOperator,
        );

        const results = await Promise.allSettled([
          this.securityService.unvetSigningKeys(
            stakingModuleData.nonce,
            blockData.blockNumber,
            blockData.blockHash,
            stakingModuleData.stakingModuleId,
            operatorIds,
            vettedKeysByOperator,
            signature,
          ),
          this.guardianMessageService.sendUnvetMessage({
            nonce: stakingModuleData.nonce,
            blockNumber: blockData.blockNumber,
            blockHash: blockData.blockHash,
            guardianAddress: blockData.guardianAddress,
            guardianIndex: blockData.guardianIndex,
            stakingModuleId: stakingModuleId,
            operatorIds,
            vettedKeysByOperator,
            signature,
          }),
        ]);

        results.forEach((result) => {
          if (result.status === 'rejected') {
            this.logger.error(result.reason);
          }
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
  ): UnvetData[] {
    const operatorNewVettedAmount = this.findNewVettedAmount(keysForUnvetting);
    return this.packByChunks(operatorNewVettedAmount, maxOperatorsPerUnvetting);
  }

  /**
   * Finds the key with the smallest index in the list of keys for unvetting.
   * It returns a map where each operator's total vetted amount is stored.
   * @param keysForUnvetting - Array of RegistryKey objects
   * @returns Map of operator indices to their total vetted amount
   */
  findNewVettedAmount(keysForUnvetting: RegistryKey[]): Map<number, number> {
    return keysForUnvetting.reduce((acc, key) => {
      const vettedAmount = acc.get(key.operatorIndex);
      if (vettedAmount === undefined || key.index < vettedAmount) {
        acc.set(key.operatorIndex, key.index);
      }
      return acc;
    }, new Map<number, number>());
  }

  /**
   * Forms an array of chunks from the map of total vetted amounts for operators based on maxOperatorsPerUnvetting.
   * Each operator index is packed in 8 bytes and vetted amount in 16 bytes.
   * @param operatorNewVettedAmount - Map of operator indices to their total vetted amounts
   * @param maxOperatorsPerUnvetting - Maximum number of operators per unvetting chunk
   * @returns Array of objects each containing packed operatorIds and vettedAmount
   */
  packByChunks(
    operatorNewVettedAmount: Map<number, number>,
    maxOperatorsPerUnvetting: number,
  ): UnvetData[] {
    const operatorVettedPairs = Array.from(operatorNewVettedAmount.entries());

    const chunksAmount = Math.ceil(
      operatorVettedPairs.length / maxOperatorsPerUnvetting,
    );

    const chunkStartIndices = Array.from(
      { length: chunksAmount },
      (_, i) => i * maxOperatorsPerUnvetting,
    );

    return chunkStartIndices.reduce<UnvetData[]>((acc, startIndex) => {
      const chunk = operatorVettedPairs.slice(
        startIndex,
        startIndex + maxOperatorsPerUnvetting,
      );

      acc.push({
        operatorIds: packNodeOperatorIds(chunk.map((p) => p[0])),
        vettedKeysByOperator: packVettedSigningKeysCounts(
          chunk.map((p) => p[1]),
        ),
      });
      return acc;
    }, []);
  }
}
