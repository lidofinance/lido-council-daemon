import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import { VerifiedDepositEvent } from 'contracts/deposit';
import { SecurityService } from 'contracts/security';

import { ContractsState, BlockData, StakingModuleData } from '../interfaces';
import { GUARDIAN_DEPOSIT_RESIGNING_BLOCKS } from '../guardian.constants';
import { GuardianMetricsService } from '../guardian-metrics';
import { GuardianMessageService } from '../guardian-message';

import { StakingRouterService } from 'staking-router';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
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
      this.logger.error('Found duplicated vetted keys', {
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
        this.logger.error('Found that we already deposited on these keys');
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
    const attackIntersections = validIntersections.filter(
      (deposit) => deposit.wc !== blockData.lidoWC,
    );

    return attackIntersections;
  }

  /**
   * If we find an intersection between the unused keys and the deposited keys in the Ethereum deposit contract
   * with Lido withdrawal credentials, we need to determine whether this deposit was made by Lido.
   * If it was indeed made by Lido, we set a metric and skip sending deposit messages in the queue for this iteration.
   */
  public async getIntersectionBetweenUsedAndUnusedKeys(
    intersectionsWithLidoWC: VerifiedDepositEvent[],
    blockData: BlockData,
  ) {
    // should not check invalid
    // TODO: fix in prev PR
    const validIntersections = intersectionsWithLidoWC.filter(
      ({ valid }) => valid,
    );
    if (!validIntersections.length) return [];

    const depositedPubkeys = validIntersections.map(
      (deposit) => deposit.pubkey,
    );

    if (!depositedPubkeys.length) {
      return [];
    }

    this.logger.log(
      'Found intersections with lido credentials, need to check used duplicated keys',
    );

    const alreadyDepositedKeys = await this.getDuplicatedLidoUsedKeys(
      depositedPubkeys,
      blockData.blockNumber,
    );

    return alreadyDepositedKeys;
  }

  /**
   * Upon identifying the intersection of keys deposited and unused with Lido withdrawal credentials,
   * use the KAPI /v1/keys/find endpoint to locate all keys with duplicates.
   * Filter out the used keys, and since used keys cannot be deleted,
   * it is sufficient to check if the blockNumber in the new result is greater than the current blockNumber.
   */
  private async getDuplicatedLidoUsedKeys(
    keys: string[],
    prevBlockNumber: number,
  ): Promise<RegistryKey[]> {
    const { data, meta } =
      await this.stakingRouterService.getKeysWithDuplicates(keys);

    if (meta.elBlockSnapshot.blockNumber < prevBlockNumber) {
      const errorMsg =
        'BlockNumber of the current response older than previous response from KAPI';
      this.logger.error(errorMsg, {
        previous: prevBlockNumber,
        current: meta.elBlockSnapshot.blockNumber,
      });
      throw Error(errorMsg);
    }
    const usedKeys = data.filter((key) => key.used);

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

    if (
      !lastContractsState ||
      !this.isSameStakingModuleContractState(
        currentContractState.blockNumber,
        lastContractsState.blockNumber,
      )
    ) {
      const invalidKeys = await this.getInvalidKeys(
        stakingModuleData,
        blockData,
      );
      if (invalidKeys.length) {
        this.logger.error(
          'Found invalid keys, will skip deposits until solving problem',
        );
        // set metric council_daemon_invalid_key
        return;
      }
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

  public async getInvalidKeys(
    stakingModuleData: StakingModuleData,
    blockData: BlockData,
  ): Promise<{ key: string; depositSignature: string }[]> {
    this.logger.log('Start keys validation', {
      keysCount: stakingModuleData.vettedKeys.length,
    });
    const validationTimeStart = performance.now();
    const invalidKeysList = await this.keysValidationService.validateKeys(
      [
        ...stakingModuleData.vettedKeys,
        {
          ...stakingModuleData.vettedKeys[0],
          depositSignature: stakingModuleData.vettedKeys[1].depositSignature,
        },
      ],
      blockData.lidoWC,
    );
    const validationTimeEnd = performance.now();
    const validationTime =
      Math.ceil(validationTimeEnd - validationTimeStart) / 1000;

    this.logger.log('Keys validated', {
      invalidKeysList,
      validationTime,
    });

    return invalidKeysList;
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
    if (
      !this.isSameStakingModuleContractState(
        firstState.nonce,
        secondState.nonce,
      )
    )
      return false;

    if (
      Math.floor(firstState.blockNumber / GUARDIAN_DEPOSIT_RESIGNING_BLOCKS) !==
      Math.floor(secondState.blockNumber / GUARDIAN_DEPOSIT_RESIGNING_BLOCKS)
    ) {
      return false;
    }

    return true;
  }

  /**
   * @returns true if nonce is the same
   */
  public isSameStakingModuleContractState(
    firstNonce: number,
    secondNonce: number,
  ): boolean {
    if (firstNonce !== secondNonce) return false;

    return true;
  }
}
