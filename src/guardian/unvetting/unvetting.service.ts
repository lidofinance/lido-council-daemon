import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { SecurityService } from 'contracts/security';
import { GuardianMessageService } from 'guardian/guardian-message';
import { BlockData, StakingModuleData } from 'guardian/interfaces';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { packNodeOperatorIds, packVettedSigningKeysCounts } from './bytes';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

type UnvetData = { operatorIds: string; vettedKeysByOperator: string };

@Injectable()
export class UnvettingService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private securityService: SecurityService,
    private guardianMessageService: GuardianMessageService,
  ) {}

  /**
   * Handles unvetting of invalid, duplicated, and front-ran keys.
   *
   * 1. Collects keys flagged for unvetting from `stakingModuleData`.
   * 2. Logs and exits if no keys require unvetting.
   * 3. Retrieves the maximum operators per unvetting from `SecurityService`.
   * 4. Prepares and processes the first chunk to avoid transaction races.
   * 5. Sends a transaction to the Security contract and forwards messages to the guardian broker.
   *
   * @param stakingModuleData - Staking module data, including keys for unvetting.
   * @param blockData - Collected data from the current block.
   * @returns void
   */
  public async handleUnvetting(
    stakingModuleData: StakingModuleData,
    blockData: BlockData,
  ) {
    const invalidKeys = this.collectInvalidKeys(stakingModuleData);

    if (!invalidKeys.length) {
      this.logNoUnvettingNeeded(blockData, stakingModuleData);
      return;
    }

    const maxOperatorsPerUnvetting = await this.getMaxOperatorsPerUnvetting();
    const firstChunk = this.calculateNewStakingLimit(
      invalidKeys,
      maxOperatorsPerUnvetting,
    );

    await this.processUnvetting(stakingModuleData, blockData, firstChunk);
  }

  private collectInvalidKeys(
    stakingModuleData: StakingModuleData,
  ): RegistryKey[] {
    return stakingModuleData.invalidKeys.concat(
      stakingModuleData.duplicatedKeys,
      stakingModuleData.frontRunKeys,
    );
  }

  private logNoUnvettingNeeded(
    blockData: BlockData,
    stakingModuleData: StakingModuleData,
  ): void {
    this.logger.debug?.('Keys are correct. No need for unvetting', {
      blockHash: blockData.blockHash,
      stakingModuleId: stakingModuleData.stakingModuleId,
    });
  }

  public async processUnvetting(
    stakingModuleData: StakingModuleData,
    blockData: BlockData,
    chunk: UnvetData,
  ) {
    const { blockNumber, blockHash, guardianAddress, guardianIndex } =
      blockData;
    const { nonce, stakingModuleId } = stakingModuleData;
    const { operatorIds, vettedKeysByOperator } = chunk;
    const signature = await this.securityService.signUnvetData(
      nonce,
      blockNumber,
      blockHash,
      stakingModuleId,
      operatorIds,
      vettedKeysByOperator,
    );

    if (!blockData.walletBalanceCritical) {
      this.logSufficientBalance(blockData, stakingModuleData);

      this.securityService
        .unvetSigningKeys(
          nonce,
          blockNumber,
          blockHash,
          stakingModuleId,
          operatorIds,
          vettedKeysByOperator,
          signature,
        )
        .catch((error) =>
          this.logger.error('Failed to send unvet transaction', {
            error,
            blockHash,
            stakingModuleId,
          }),
        );
    } else {
      this.logCriticalBalance(blockData, stakingModuleData);
    }

    await this.guardianMessageService.sendUnvetMessage({
      nonce,
      blockNumber,
      blockHash,
      guardianAddress,
      guardianIndex,
      stakingModuleId,
      operatorIds,
      vettedKeysByOperator,
      signature,
    });
  }

  private logSufficientBalance(
    blockData: BlockData,
    stakingModuleData: StakingModuleData,
  ): void {
    this.logger.log(
      'Wallet balance is sufficient, sending unvet transaction.',
      {
        blockHash: blockData.blockHash,
        stakingModuleId: stakingModuleData.stakingModuleId,
      },
    );
  }

  private logCriticalBalance(
    blockData: BlockData,
    stakingModuleData: StakingModuleData,
  ): void {
    this.logger.warn(
      'Wallet balance is critical. Skipping unvet transaction.',
      {
        blockHash: blockData.blockHash,
        stakingModuleId: stakingModuleData.stakingModuleId,
      },
    );
  }

  private async getMaxOperatorsPerUnvetting() {
    return await this.securityService.getMaxOperatorsPerUnvetting();
  }

  private calculateNewStakingLimit(
    keysForUnvetting: RegistryKey[],
    maxOperatorsPerUnvetting: number,
  ): UnvetData {
    const operatorNewVettedAmount = this.findNewVettedAmount(keysForUnvetting);
    return this.getFirstChunk(
      operatorNewVettedAmount,
      maxOperatorsPerUnvetting,
    );
  }

  /**
   * Finds the key with the smallest index in the list of keys for unvetting.
   * It returns a map where each operator's total vetted amount is stored.
   * @param keysForUnvetting - Array of RegistryKey objects
   * @returns Map of operator indices to their total vetted amount
   */
  private findNewVettedAmount(
    keysForUnvetting: RegistryKey[],
  ): Map<number, number> {
    return keysForUnvetting.reduce((acc, key) => {
      const vettedAmount = acc.get(key.operatorIndex);
      if (vettedAmount === undefined || key.index < vettedAmount) {
        acc.set(key.operatorIndex, key.index);
      }
      return acc;
    }, new Map<number, number>());
  }

  /**
   * Return first chunk from the map of total vetted amounts for operators based on maxOperatorsPerUnvetting.
   * Each operator index is packed in 8 bytes and vetted amount in 16 bytes.
   * @param operatorNewVettedAmount - Map of operator indices to their total vetted amounts
   * @param maxOperatorsPerUnvetting - Maximum number of operators per unvetting chunk
   * @returns Object containing packed operatorIds and vettedAmount
   */
  private getFirstChunk(
    operatorNewVettedAmount: Map<number, number>,
    maxOperatorsPerUnvetting: number,
  ): UnvetData {
    const chunk = Array.from(operatorNewVettedAmount.entries()).slice(
      0,
      maxOperatorsPerUnvetting,
    );

    this.logger.log('Get first chunk for unvetting', {
      count: chunk.length,
      maxOperatorsPerUnvetting,
      totalChunks: Math.ceil(
        operatorNewVettedAmount.size / maxOperatorsPerUnvetting,
      ),
    });

    return {
      operatorIds: packNodeOperatorIds(chunk.map((p) => p[0])),
      vettedKeysByOperator: packVettedSigningKeysCounts(chunk.map((p) => p[1])),
    };
  }
}
