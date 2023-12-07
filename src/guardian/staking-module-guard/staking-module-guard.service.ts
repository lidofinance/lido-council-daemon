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

@Injectable()
export class StakingModuleGuardService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private logger: LoggerService,

    private securityService: SecurityService,
    private lidoService: LidoService,

    private stakingRouterService: StakingRouterService,
    private guardianMetricsService: GuardianMetricsService,
    private guardianMessageService: GuardianMessageService,
  ) {}

  private lastContractsStateByModuleId: Record<number, ContractsState | null> =
    {};

  /**
   * @returns List of staking modules id with duplicates
   */
  public checkVettedKeysDuplicates(
    stakingModulesData: StakingModuleData[],
    blockData: BlockData,
  ): number[] {
    // Collects the duplicate count for each unique key across staking modules.
    // The outer Map uses the key string as the key and holds an inner Map.
    // The inner Map uses module id as keys and stores the duplicate count for each module.
    const keyMap = new Map<string, Map<number, number>>();
    const modulesWithDuplicatedKeysSet = new Set<number>();
    const duplicatedKeys = new Map<string, Map<number, number>>();

    stakingModulesData.forEach(({ vettedKeys, stakingModuleId }) => {
      // check module keys on duplicates across all modules
      vettedKeys.forEach((key) => {
        const stakingModules = keyMap.get(key.key);

        if (!stakingModules) {
          // add new key
          keyMap.set(key.key, new Map([[stakingModuleId, 1]]));
        } else {
          // found duplicate
          // Duplicate key found
          const moduleCount = stakingModules.get(stakingModuleId) || 0;
          stakingModules.set(stakingModuleId, moduleCount + 1);

          if (this.hasDuplicateKeys(stakingModules)) {
            stakingModules.forEach((_, id) => {
              modulesWithDuplicatedKeysSet.add(id);
            });
            duplicatedKeys.set(key.key, stakingModules);
          }
        }
      });
    });

    if (modulesWithDuplicatedKeysSet.size) {
      const moduleAddressesWithDuplicatesList: number[] = Array.from(
        modulesWithDuplicatedKeysSet,
      );
      this.logger.warn('Found duplicated vetted keys', {
        blockHash: blockData.blockHash,
        duplicatedKeys: Array.from(duplicatedKeys),
        moduleAddressesWithDuplicates: moduleAddressesWithDuplicatesList,
      });

      //TODO: set prometheus metric council_daemon_vetted_unused_duplicate
      return moduleAddressesWithDuplicatesList;
    }

    return [];
  }

  private hasDuplicateKeys(stakingModules: Map<number, number>): boolean {
    const moduleCounts = Array.from(stakingModules.values());

    return stakingModules.size > 1 || moduleCounts[0] > 1;
  }

  public excludeModulesWithDuplicatedKeys(
    stakingModulesData: StakingModuleData[],
    modulesIdWithDuplicateKeys: number[],
  ): StakingModuleData[] {
    // exclude from stakingModulesData stakingModulesWithDuplicates
    let stakingModulesWithoutDuplicates: StakingModuleData[] =
      stakingModulesData;

    if (modulesIdWithDuplicateKeys.length) {
      // need to filter stakingModulesWithoutDuplicates

      stakingModulesWithoutDuplicates = stakingModulesWithoutDuplicates.filter(
        ({ stakingModuleId }) =>
          !modulesIdWithDuplicateKeys.includes(stakingModuleId),
      );
    }

    return stakingModulesWithoutDuplicates;
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

    const keysIntersections = this.getKeysIntersections(
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
      // it could throw error if kapi returned old data
      const usedKeys = await this.getIntersectionBetweenUsedAndUnusedKeys(
        keysIntersections,
        blockData,
      );

      // if found used keys, Lido already made deposit on this keys
      if (usedKeys.length) {
        this.logger.log('Found that we already deposited on these keys');
        // set metric council_daemon_used_duplicate
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
  public getKeysIntersections(
    stakingModuleData: StakingModuleData,
    blockData: BlockData,
  ): VerifiedDepositEvent[] {
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

  public async getIntersectionBetweenUsedAndUnusedKeys(
    intersectionsWithLidoWC: VerifiedDepositEvent[],
    blockData: BlockData,
  ) {
    const depositedPubkeys = intersectionsWithLidoWC.map(
      (deposit) => deposit.pubkey,
    );

    if (depositedPubkeys.length) {
      this.logger.log(
        'Found intersections with lido credentials, need to check duplicated keys',
      );

      const { data, meta } =
        await this.stakingRouterService.getKeysWithDuplicates(depositedPubkeys);

      if (meta.elBlockSnapshot.blockNumber < blockData.blockNumber) {
        // blockData.blockNumber we also read from kapi, so smth is wrong in kapi
        this.logger.error(
          'BlockNumber of the response older than previous response from KAPI',
          {
            previous: blockData.blockNumber,
            current: meta.elBlockSnapshot.blockNumber,
          },
        );
        throw Error(
          'BlockNumber of the response older than previous response from KAPI',
        );
      }

      const usedKeys = data.filter((key) => key.used);
      return usedKeys;
    }

    return [];
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
    this.securityService
      .pauseDeposits(blockNumber, stakingModuleId, signature)
      .catch((error) => this.logger.error(error));

    await this.guardianMessageService.sendPauseMessage(pauseMessage);
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

    await this.guardianMessageService.sendDepositMessage(depositMessage);
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
