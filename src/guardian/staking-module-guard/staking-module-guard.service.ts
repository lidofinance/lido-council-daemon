import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import { VerifiedDepositEvent } from 'contracts/deposit';
import { SecurityService } from 'contracts/security';
import { LidoService } from 'contracts/lido';

import { ContractsState, BlockData, StakingModuleData } from '../interfaces';
import { GUARDIAN_DEPOSIT_RESIGNING_BLOCKS } from '../guardian.constants';
import { GuardianMetricsService } from '../guardian-metrics';
import { GuardianMessageService } from '../guardian-message';

import { StakingRouterService } from 'staking-router';
import { SRModule } from 'keys-api/interfaces';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';

@Injectable()
export class StakingModuleGuardService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private logger: LoggerService,

    private securityService: SecurityService,
    private lidoService: LidoService,

    private stakingRouterService: StakingRouterService,
    private guardianMetricsService: GuardianMetricsService, // private guardianMessageService: GuardianMessageService,
  ) {}

  private lastContractsStateByModuleId: Record<number, ContractsState | null> =
    {};

  /**
   * Check vetted among staking modules
   */
  public async checkVettedKeysDuplicates(
    vettedKeys: RegistryKey[],
    blockData: BlockData,
  ): Promise<void> {
    const uniqueKeys = new Set();
    const duplicatedKeys = vettedKeys.filter(
      (vettedKey) => uniqueKeys.size === uniqueKeys.add(vettedKey.key).size,
    );

    if (duplicatedKeys.length) {
      this.logger.warn('Found duplicated vetted key', {
        blockHash: blockData.blockHash,
        duplicatedKeys,
      });
      //TODO: set metric
      throw Error('Found duplicated vetted key');
    }
  }

  /**
   * Checks keys for intersections with previously deposited keys and handles the situation
   * @param blockData - collected data from the current block
   */
  public async checkKeysIntersections(
    stakingModuleData: StakingModuleData,
    blockData: BlockData,
  ): Promise<void> {
    const { blockHash } = blockData;
    const { stakingModuleId } = stakingModuleData;

    const keysIntersections = await this.getKeysIntersections(
      stakingModuleData,
      blockData,
    );

    const filteredIntersections = await this.excludeEligibleIntersections(
      blockData,
      keysIntersections,
    );

    const isFilteredIntersectionsFound = filteredIntersections.length > 0;

    this.guardianMetricsService.collectIntersectionsMetrics(
      stakingModuleData.stakingModuleId,
      keysIntersections,
      filteredIntersections,
    );

    const isDepositsPaused = await this.securityService.isDepositsPaused(
      stakingModuleData.stakingModuleId,
      {
        blockHash: stakingModuleData.blockHash,
      },
    );

    if (isDepositsPaused) {
      this.logger.warn('Deposits are paused', { blockHash, stakingModuleId });
      return;
    }

    if (isFilteredIntersectionsFound) {
      await this.handleKeysIntersections(stakingModuleData, blockData);
    } else {
      const usedKeys = await this.handleIntersectionBetweenUsedAndUnusedKeys(
        keysIntersections,
      );

      // if found used keys, Lido already made deposit on this keys
      if (usedKeys) {
        this.logger.log('Found that we already deposited on these keys');
        return;
      }

      await this.handleCorrectKeys(stakingModuleData, blockData);
    }
  }

  /**
   * Finds the intersection of the next deposit keys in the list of all previously deposited keys
   * Quick check that can be done on each block
   * @param blockData - collected data from the current block
   * @returns list of keys that were deposited earlier
   */
  public async getKeysIntersections(
    stakingModuleData: StakingModuleData,
    blockData: BlockData,
  ): Promise<VerifiedDepositEvent[]> {
    const { blockHash, depositRoot, depositedEvents } = blockData;
    const { nonce, unusedKeys, stakingModuleId } = stakingModuleData;

    const unusedKeysSet = new Set(unusedKeys);
    const intersections = depositedEvents.events.filter(({ pubkey }) =>
      unusedKeysSet.has(pubkey),
    );

    if (intersections.length) {
      this.logger.warn('Already deposited keys found in the module keys', {
        blockHash,
        depositRoot,
        nonce,
        intersections,
        stakingModuleId,
      });
    }

    return intersections;
  }

  /**
   * Excludes invalid deposits and deposits with Lido WC from intersections
   * @param intersections - list of deposits with keys that were deposited earlier
   * @param blockData - collected data from the current block
   */
  public async excludeEligibleIntersections(
    blockData: BlockData,
    intersections: VerifiedDepositEvent[],
  ): Promise<VerifiedDepositEvent[]> {
    // Exclude deposits with invalid signature over the deposit data
    const validIntersections = intersections.filter(({ valid }) => valid);
    if (!validIntersections.length) return [];

    // Exclude deposits with Lido withdrawal credentials
    const { blockHash } = blockData;
    const lidoWC = await this.lidoService.getWithdrawalCredentials({
      blockHash,
    });
    const attackIntersections = validIntersections.filter(
      (deposit) => deposit.wc !== lidoWC,
    );

    return attackIntersections;
  }

  public async handleIntersectionBetweenUsedAndUnusedKeys(
    intersectionsWithLidoWC: VerifiedDepositEvent[],
  ) {
    this.logger.log(
      'Found intersections with lido credentials, need to check duplicated keys',
    );
    const depositedPubkeys = intersectionsWithLidoWC.map(
      (deposit) => deposit.pubkey,
    );
    const keys = await this.stakingRouterService.getKeysWithDuplicates(
      depositedPubkeys,
    );
    const usedKeys = keys.data.filter((key) => key.used);
    return usedKeys;
  }

  /**
   * Handles the situation when keys have previously deposited copies
   * @param blockData - collected data from the current block
   */
  public async handleKeysIntersections(
    stakingModuleData: StakingModuleData,
    blockData: BlockData,
  ): Promise<void> {
    const {
      blockNumber,
      blockHash,
      guardianAddress,
      guardianIndex,
      depositRoot,
    } = blockData;

    const { nonce, stakingModuleId } = stakingModuleData;

    const signature = await this.securityService.signPauseData(
      blockNumber,
      stakingModuleId,
    );

    const pauseMessage = {
      depositRoot,
      nonce,
      guardianAddress,
      guardianIndex,
      blockNumber,
      blockHash,
      signature,
      stakingModuleId,
    };

    this.logger.warn('Suspicious case detected, initialize the module pause', {
      blockHash,
      stakingModuleId,
    });

    // Call pause without waiting for completion
    // this.securityService
    //   .pauseDeposits(blockNumber, stakingModuleId, signature)
    //   .catch((error) => this.logger.error(error));

    // await this.guardianMessageService.sendPauseMessage(pauseMessage);
  }

  /**
   * Handles the situation when keys do not have previously deposited copies
   * @param blockData - collected data from the current block
   */
  public async handleCorrectKeys(
    stakingModuleData: StakingModuleData,
    blockData: BlockData,
  ): Promise<void> {
    const {
      blockNumber,
      blockHash,
      depositRoot,
      guardianAddress,
      guardianIndex,
    } = blockData;

    const { nonce, stakingModuleId } = stakingModuleData;

    const currentContractState = { nonce, depositRoot, blockNumber };

    const lastContractsState =
      this.lastContractsStateByModuleId[stakingModuleId];

    const isSameContractsState = this.isSameContractsStates(
      currentContractState,
      lastContractsState,
    );

    this.lastContractsStateByModuleId[stakingModuleId] = currentContractState;

    if (isSameContractsState) return;

    const signature = await this.securityService.signDepositData(
      depositRoot,
      nonce,
      blockNumber,
      blockHash,
      stakingModuleId,
    );

    const depositMessage = {
      depositRoot,
      nonce,
      blockNumber,
      blockHash,
      guardianAddress,
      guardianIndex,
      signature,
      stakingModuleId,
    };

    this.logger.log('No problems found', {
      blockHash,
      lastState: lastContractsState,
      newState: currentContractState,
    });

    // await this.guardianMessageService.sendDepositMessage(depositMessage);
  }

  /**
   * Compares the states of the contracts to decide if the message needs to be re-signed
   * @param firstState - contracts state
   * @param secondState - contracts state
   * @returns true if state is the same
   */
  public isSameContractsStates(
    firstState: ContractsState | null,
    secondState: ContractsState | null,
  ): boolean {
    if (!firstState || !secondState) return false;
    if (firstState.depositRoot !== secondState.depositRoot) return false;
    if (firstState.nonce !== secondState.nonce) return false;
    if (
      Math.floor(firstState.blockNumber / GUARDIAN_DEPOSIT_RESIGNING_BLOCKS) !==
      Math.floor(secondState.blockNumber / GUARDIAN_DEPOSIT_RESIGNING_BLOCKS)
    ) {
      return false;
    }

    return true;
  }
}
