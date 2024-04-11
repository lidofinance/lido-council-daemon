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
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';

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

  isFirstEventEarlier(
    firstEvent: VerifiedDepositEvent,
    secondEvent: VerifiedDepositEvent,
  ) {
    const isSameBlock = firstEvent?.blockNumber === secondEvent.blockNumber;

    let isFirstEventEarlier = false;

    if (isSameBlock) {
      isFirstEventEarlier = firstEvent?.logIndex < secondEvent.logIndex;
    } else {
      isFirstEventEarlier = firstEvent?.blockNumber < secondEvent.blockNumber;
    }

    return isFirstEventEarlier;
  }
  /**
   * Method is not taking into account WC rotation since historical deposits were checked manually
   * @param blockData
   * @returns
   */
  async getHistoricalFrontRun(blockData: BlockData) {
    const { depositedEvents, lidoWC } = blockData;
    const potentialLidoDepositsEvents = depositedEvents.events.filter(
      ({ wc, valid }) => wc === lidoWC && valid,
    );

    this.logger.log('potential lido deposits events count', {
      count: potentialLidoDepositsEvents.length,
    });

    const potentialLidoDepositsKeysMap: Record<string, VerifiedDepositEvent> =
      {};

    potentialLidoDepositsEvents.forEach((event) => {
      if (potentialLidoDepositsKeysMap[event.pubkey]) {
        const existed = potentialLidoDepositsKeysMap[event.pubkey];
        const isExisted = this.isFirstEventEarlier(existed, event);
        // this should not happen, since Lido deposits once per key.
        // but someone can still make such a deposit.
        if (isExisted) return;
      }
      potentialLidoDepositsKeysMap[event.pubkey] = event;
    });

    const duplicatedDepositEvents: VerifiedDepositEvent[] = [];

    depositedEvents.events.forEach((event) => {
      if (potentialLidoDepositsKeysMap[event.pubkey] && event.wc !== lidoWC) {
        duplicatedDepositEvents.push(event);
      }
    });

    this.logger.log('duplicated deposit events', {
      count: duplicatedDepositEvents.length,
    });

    const validDuplicatedDepositEvents = duplicatedDepositEvents.filter(
      (event) => event.valid,
    );

    this.logger.log('valid duplicated deposit events', {
      count: validDuplicatedDepositEvents.length,
    });

    const frontRunnedDepositEvents = validDuplicatedDepositEvents.filter(
      (suspectedEvent) => {
        // get event from lido map
        const sameKeyLidoDeposit =
          potentialLidoDepositsKeysMap[suspectedEvent.pubkey];

        if (!sameKeyLidoDeposit) throw new Error('expected event not found');

        return this.isFirstEventEarlier(suspectedEvent, sameKeyLidoDeposit);
      },
    );

    this.logger.log('front runned deposit events', {
      events: frontRunnedDepositEvents,
    });

    const frontRunnedDepositKeys = frontRunnedDepositEvents.map(
      ({ pubkey }) => pubkey,
    );

    if (!frontRunnedDepositKeys.length) {
      return false;
    }

    const lidoDepositedKeys = await this.stakingRouterService.getKeysByPubkeys(
      frontRunnedDepositKeys,
    );

    const isLidoDepositedKeys = lidoDepositedKeys.data.length;

    if (isLidoDepositedKeys) {
      this.logger.warn('historical front-run found');
    }

    return isLidoDepositedKeys;
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
    // TODO: add metrics for getHistoricalFrontRun same as for keysIntersections
    const historicalFrontRunFound = await this.getHistoricalFrontRun(blockData);

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

    if (isFilteredIntersectionsFound || historicalFrontRunFound) {
      await this.handleKeysIntersections(stakingModuleData, blockData);
    } else {
      if (stakingModuleData.duplicatedKeys.length) {
        this.logger.warn('Found duplicated keys', {
          blockHash,
          stakingModuleId,
          duplicatesAmount: stakingModuleData.duplicatedKeys.length,
        });
        return;
      }

      const invalidKeys = await this.getInvalidKeys(
        stakingModuleData,
        blockData,
      );

      if (invalidKeys.length) {
        this.logger.error('Staking module contains invalid keys');
        this.logger.log('State', {
          blockHash: stakingModuleData.blockHash,
          lastChangedBlockHash: stakingModuleData.lastChangedBlockHash,
          stakingModuleId: stakingModuleData.stakingModuleId,
        });
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

    // TODO: add staking module id
    this.logger.log(
      'Found intersections with lido credentials, need to check used duplicated keys',
    );

    const { data, meta } = await this.stakingRouterService.getKeysByPubkeys(
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
    };

    const lastContractsState =
      this.lastContractsStateByModuleId[stakingModuleId];

    const isSameContractsState = this.isSameContractsStates(
      currentContractState,
      lastContractsState,
    );

    this.lastContractsStateByModuleId[stakingModuleId] = currentContractState;

    if (isSameContractsState) {
      this.logger.log("Contract states didn't change", { stakingModuleId });
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
      stakingModuleId,
      blockHash,
      lastState: lastContractsState,
      newState: currentContractState,
    });

    await this.guardianMessageService.sendDepositMessage(depositMessage);
  }

  public async getInvalidKeys(
    stakingModuleData: StakingModuleData,
    blockData: BlockData,
  ): Promise<RegistryKey[]> {
    this.logger.log('Start keys validation', {
      keysCount: stakingModuleData.vettedUnusedKeys.length,
      stakingModuleId: stakingModuleData.stakingModuleId,
    });

    // TODO: move to decorator
    const validationTimeStart = performance.now();

    const invalidKeysList = await this.keysValidationService.getInvalidKeys(
      stakingModuleData.vettedUnusedKeys,
      blockData.lidoWC,
    );

    const validationTimeEnd = performance.now();
    const validationTime =
      Math.ceil(validationTimeEnd - validationTimeStart) / 1000;

    this.logger.log('Keys validated', {
      stakingModuleId: stakingModuleData.stakingModuleId,
      invalidKeysCount: invalidKeysList.length,
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
