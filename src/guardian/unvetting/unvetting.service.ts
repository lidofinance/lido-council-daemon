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
   * Unvet invalid, duplicated, front-runned keys. Sending transaction in Security contract, sending messages in broker
   */
  async handleUnvetting(
    stakingModuleData: StakingModuleData,
    blockData: BlockData,
  ) {
    const keys = [
      ...stakingModuleData.invalidKeys,
      ...stakingModuleData.duplicatedKeys,
      ...stakingModuleData.frontRunKeys,
    ];

    if (!keys.length) {
      this.logger.debug?.('Keys are correct. No need for unvetting', {
        blockHash: blockData.blockHash,
        stakingModuleId: stakingModuleData.stakingModuleId,
      });
      return;
    }

    const maxOperatorsPerUnvetting = await this.getMaxOperatorsPerUnvetting();
    const firstChunk = this.getNewVettedAmount(keys, maxOperatorsPerUnvetting);

    await this.unvetSignKeysChunk(stakingModuleData, blockData, firstChunk);
  }

  async unvetSignKeysChunk(
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
      .catch(this.logger.error);

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

  async getMaxOperatorsPerUnvetting() {
    return await this.securityService.getMaxOperatorsPerUnvetting();
  }

  getNewVettedAmount(
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
   * Return first chunk from the map of total vetted amounts for operators based on maxOperatorsPerUnvetting.
   * Each operator index is packed in 8 bytes and vetted amount in 16 bytes.
   * @param operatorNewVettedAmount - Map of operator indices to their total vetted amounts
   * @param maxOperatorsPerUnvetting - Maximum number of operators per unvetting chunk
   * @returns Object containing packed operatorIds and vettedAmount
   */
  getFirstChunk(
    operatorNewVettedAmount: Map<number, number>,
    maxOperatorsPerUnvetting: number,
  ): UnvetData {
    const operatorVettedPairs = Array.from(operatorNewVettedAmount.entries());

    const totalChunks = Math.ceil(
      operatorVettedPairs.length / maxOperatorsPerUnvetting,
    );

    const chunk = operatorVettedPairs.slice(0, maxOperatorsPerUnvetting);

    this.logger.log('Get first chunk for unvetting', {
      count: chunk.length,
      maxOperatorsPerUnvetting,
      totalChunks,
    });

    return {
      operatorIds: packNodeOperatorIds(chunk.map((p) => p[0])),
      vettedKeysByOperator: packVettedSigningKeysCounts(chunk.map((p) => p[1])),
    };
  }
}
