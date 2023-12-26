import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import { VerifiedDepositEvent } from 'contracts/deposit';
import { SecurityService } from 'contracts/security';

import { ContractsState, BlockData, StakingModuleData } from '../interfaces';
import { GUARDIAN_DEPOSIT_RESIGNING_BLOCKS } from '../guardian.constants';
import { GuardianMetricsService } from '../guardian-metrics';
import { GuardianMessageService } from '../guardian-message';

import { StakingRouterService } from 'staking-router';
import { KeysValidationService } from 'guardian/keys-validation/keys-validation.service';
import { performance } from 'perf_hooks';

@Injectable()
export class StakingModuleGuardService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private logger: LoggerService,

    private securityService: SecurityService,
    private stakingRouterService: StakingRouterService,
    private guardianMetricsService: GuardianMetricsService,
    private guardianMessageService: GuardianMessageService,
    private keysValidationService: KeysValidationService,
  ) {}

  private lastContractsStateByModuleId: Record<number, ContractsState | null> =
    {};
  private duplicatedKeysWasFound = false;

  /**
   * @returns List of staking modules id with duplicates
   */
  public getModulesIdsWithDuplicatedVettedUnusedKeys(
    stakingModulesData: StakingModuleData[],
    blockData: BlockData,
  ): number[] {
    // if on prev iteration was found duplicated keys, and we cached data

    // Collects the duplicate count for each unique key across staking modules.
    // The outer Map uses the key string as the key and holds an inner Map.
    // The inner Map uses module id as keys and stores the duplicate count for each module.
    const keyMap = new Map<string, Map<number, number>>();
    const modulesWithDuplicatedKeysSet = new Set<number>();
    const duplicatedKeys = new Map<string, Map<number, number>>();

    stakingModulesData.forEach(({ vettedUnusedKeys, stakingModuleId }) => {
      // check module keys on duplicates across all modules
      vettedUnusedKeys.forEach((key) => {
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
      this.logger.error('Found duplicated vetted keys');
      this.logger.log('Duplicated keys', {
        blockHash: blockData.blockHash,
        duplicatedKeys: Array.from(duplicatedKeys).map(([key, innerMap]) => ({
          key: key,
          stakingModuleIds: Array.from(innerMap.keys()),
        })),
        moduleAddressesWithDuplicates: moduleAddressesWithDuplicatesList,
      });

      this.guardianMetricsService.incrDuplicatedVettedUnusedKeysEventCounter();
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
    return stakingModulesData.filter(
      ({ stakingModuleId }) =>
        !modulesIdWithDuplicateKeys.includes(stakingModuleId),
    );
  }

  /**
   * Checks keys for intersections with previously deposited keys and handles the situation
   * @param blockData - collected data from the current block
   */
  // TODO: rename, because this method more than intersections checks
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

    // exclude invalid deposits as they ignored by cl
    const validIntersections = this.excludeInvalidDeposits(keysIntersections);

    const filteredIntersections = await this.excludeEligibleIntersections(
      blockData,
      validIntersections,
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
      const usedKeys = await this.findAlreadyDepositedKeys(
        stakingModuleData.lastChangedBlockHash,
        validIntersections,
      );

      // if found used keys, Lido already made deposit on this keys
      if (usedKeys.length) {
        this.logger.log('Found that we already deposited on these keys');
        this.guardianMetricsService.incrDuplicatedUsedKeysEventCounter();
        return;
      }

      // keys validation
      const isValidKeys = await this.isVettedUnusedKeysValid(
        stakingModuleData,
        blockData,
      );

      if (!isValidKeys) {
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

  public excludeInvalidDeposits(intersections: VerifiedDepositEvent[]) {
    // Exclude deposits with invalid signature over the deposit data
    return intersections.filter(({ valid }) => valid);
  }

  /**
   * Excludes invalid deposits and deposits with Lido WC from intersections
   * @param intersections - list of deposits with keys that were deposited earlier
   * @param blockData - collected data from the current block
   */
  public async excludeEligibleIntersections(
    blockData: BlockData,
    validIntersections: VerifiedDepositEvent[],
  ): Promise<VerifiedDepositEvent[]> {
    // Exclude deposits with Lido withdrawal credentials
    return validIntersections.filter(
      (deposit) => deposit.wc !== blockData.lidoWC,
    );
  }

  /**
   * If we find an intersection between the unused keys and the deposited keys in the Ethereum deposit contract
   * with Lido withdrawal credentials, we need to determine whether this deposit was made by Lido.
   * If it was indeed made by Lido, we set a metric and skip sending deposit messages in the queue for this iteration.
   */
  public async findAlreadyDepositedKeys(
    lastChangedBlockHash: string,
    intersectionsWithLidoWC: VerifiedDepositEvent[],
  ) {
    const depositedPubkeys = intersectionsWithLidoWC.map(
      (deposit) => deposit.pubkey,
    );
    // if depositedPubkeys == [], /find will return validation error
    if (!depositedPubkeys.length) {
      return [];
    }

    this.logger.log(
      'Found intersections with lido credentials, need to check used duplicated keys',
    );

    const { data, meta } = await this.stakingRouterService.findKeysEntires(
      depositedPubkeys,
    );

    this.stakingRouterService.isEqualLastChangedBlockHash(
      lastChangedBlockHash,
      meta.elBlockSnapshot.lastChangedBlockHash,
    );

    return data.filter((key) => key.used);
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

  public async isVettedUnusedKeysValid(
    stakingModuleData: StakingModuleData,
    blockData: BlockData,
  ): Promise<boolean> {
    const { blockNumber, depositRoot } = blockData;
    const { nonce, stakingModuleId, lastChangedBlockHash } = stakingModuleData;
    const lastContractsState =
      this.lastContractsStateByModuleId[stakingModuleId];

    if (
      lastContractsState &&
      lastChangedBlockHash === lastContractsState.lastChangedBlockHash &&
      lastContractsState.invalidKeysFound
    ) {
      // if found invalid keys on previous iteration and lastChangedBlockHash returned by kapi was not changed
      // we dont need to validate again, but we still need to skip deposits until problem will not be solved
      this.logger.error(
        'LastChangedBlockHash was not changed and on previous iteration we found invalid keys, skip until solving problem ',
      );

      this.lastContractsStateByModuleId[stakingModuleId] = {
        nonce,
        depositRoot,
        blockNumber,
        lastChangedBlockHash,
        invalidKeysFound: true,
      };

      return false;
    }

    if (
      !lastContractsState ||
      lastChangedBlockHash !== lastContractsState.lastChangedBlockHash
    ) {
      // keys was changed or it is a first attempt, need to validate again
      const invalidKeys = await this.getInvalidKeys(
        stakingModuleData,
        blockData,
      );

      // if found invalid keys, update state and exit
      if (invalidKeys.length) {
        this.logger.error(
          'Found invalid keys, will skip deposits until solving problem',
        );
        this.guardianMetricsService.incrInvalidKeysEventCounter();
        // save info about invalid keys in cache
        this.lastContractsStateByModuleId[stakingModuleId] = {
          nonce,
          depositRoot,
          blockNumber,
          lastChangedBlockHash,
          invalidKeysFound: true,
        };

        return false;
      }

      // keys are valid, state will be updated later
      return true;
    }

    return true;
  }

  public async getInvalidKeys(
    stakingModuleData: StakingModuleData,
    blockData: BlockData,
  ): Promise<{ key: string; depositSignature: string }[]> {
    this.logger.log('Start keys validation', {
      keysCount: stakingModuleData.vettedUnusedKeys.length,
      moduleId: stakingModuleData.stakingModuleId,
    });
    const validationTimeStart = performance.now();
    const invalidKeysList = await this.keysValidationService.findInvalidKeys(
      stakingModuleData.vettedUnusedKeys,
      blockData.lidoWC,
    );
    const validationTimeEnd = performance.now();
    const validationTime =
      Math.ceil(validationTimeEnd - validationTimeStart) / 1000;

    this.logger.log('Keys validated', {
      invalidKeysList,
      moduleId: stakingModuleData.stakingModuleId,
      validationTime,
    });

    return invalidKeysList;
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

    const { nonce, stakingModuleId, lastChangedBlockHash } = stakingModuleData;

    // if we are here we didn't find invalid keys
    const currentContractState = {
      nonce,
      depositRoot,
      blockNumber,
      lastChangedBlockHash,
      // if we are here we didn't find invalid keys
      invalidKeysFound: false,
    };

    const lastContractsState =
      this.lastContractsStateByModuleId[stakingModuleId];

    const isSameContractsState = this.isSameContractsStates(
      currentContractState,
      lastContractsState,
    );

    this.lastContractsStateByModuleId[stakingModuleId] = currentContractState;

    // need to check invalidKeysFound
    if (isSameContractsState) {
      this.logger.log("Contract states didn't change");
      return;
    }

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

    // If the nonce is unchanged, the state might still have changed.
    // Therefore, we need to compare the 'lastChangedBlockHash' instead
    // It's important to note that it's not possible for the nonce to be different
    // while having the same 'lastChangedBlockHash'.
    if (firstState.lastChangedBlockHash !== secondState.lastChangedBlockHash)
      return false;

    if (
      Math.floor(firstState.blockNumber / GUARDIAN_DEPOSIT_RESIGNING_BLOCKS) !==
      Math.floor(secondState.blockNumber / GUARDIAN_DEPOSIT_RESIGNING_BLOCKS)
    ) {
      return false;
    }

    return true;
  }
}
