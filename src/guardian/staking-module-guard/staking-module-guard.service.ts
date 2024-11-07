import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

import {
  VerifiedDepositEvent,
  VerifiedDepositEventGroup,
} from 'contracts/deposits-registry';
import { SecurityService } from 'contracts/security';

import { ContractsState, BlockData, StakingModuleData } from '../interfaces';
import { GUARDIAN_DEPOSIT_RESIGNING_BLOCKS } from '../guardian.constants';
import { GuardianMetricsService } from '../guardian-metrics';
import { GuardianMessageService } from '../guardian-message';

import { KeysValidationService } from 'guardian/keys-validation/keys-validation.service';
import { performance } from 'perf_hooks';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { KeysApiService } from 'keys-api/keys-api.service';

@Injectable()
export class StakingModuleGuardService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private logger: LoggerService,

    private securityService: SecurityService,
    private keysApiService: KeysApiService,
    private guardianMetricsService: GuardianMetricsService,
    private guardianMessageService: GuardianMessageService,
    private keysValidationService: KeysValidationService,
  ) {}

  private lastContractsStateByModuleId: Record<number, ContractsState | null> =
    {};

  /**
   * Determines if the first event occurred earlier than the second event.
   * Compares block numbers first; if they are equal, compares log indexes.
   *
   * @param firstEvent - The first event to compare.
   * @param secondEvent - The second event to compare.
   * @returns True if the first event is earlier, false otherwise.
   */
  private isFirstEventEarlier(
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
   * Filters and retrieves deposit events that have Lido's withdrawal credentials
   * and are marked as valid.
   *
   * @param depositedEvents - A group of deposit events.
   * @param lidoWC - The withdrawal credential associated with Lido.
   * @returns An array of deposit events that match the Lido withdrawal credential and are valid.
   */
  private getDepositsWithLidoWC(
    depositedEvents: VerifiedDepositEventGroup,
    lidoWC: string,
  ): VerifiedDepositEvent[] {
    // Filter events for those with Lido withdrawal credentials and valid status
    const depositsMatchingLidoWC = depositedEvents.events.filter(
      ({ wc, valid }) => wc === lidoWC && valid,
    );

    this.logger.log('Deposits matching Lido WC count', {
      count: depositsMatchingLidoWC.length,
    });

    return depositsMatchingLidoWC;
  }

  /**
   * Creates a map of the earliest deposit events for each public key.
   * If multiple deposits are found for the same public key, only the earliest one is stored.
   *
   * @param depositsMatchingLidoWC - Array of deposit events that match the Lido withdrawal credential
   * @returns A record map with public keys as keys and the earliest deposit events as values.
   */
  private getEarliestDepositsMap(
    depositsMatchingLidoWC: VerifiedDepositEvent[],
  ): Record<string, VerifiedDepositEvent> {
    const earliestLidoWCDepositsByPubkey: Record<string, VerifiedDepositEvent> =
      {};

    depositsMatchingLidoWC.forEach((event) => {
      const existingDeposit = earliestLidoWCDepositsByPubkey[event.pubkey];

      if (existingDeposit) {
        const isExistingEarlier = this.isFirstEventEarlier(
          existingDeposit,
          event,
        );
        // This should not happen, since only one deposit per key is expected.
        // However, someone could still make such a deposit.
        if (isExistingEarlier) return;
      }
      earliestLidoWCDepositsByPubkey[event.pubkey] = event;
    });

    return earliestLidoWCDepositsByPubkey;
  }

  /**
   * Identifies duplicated deposit events that have non-Lido withdrawal credentials.
   * These are deposits made on the same public key but with different withdrawal credentials.
   *
   * @param depositEventGroup - A group of deposit events.
   * @param lidoWithdrawalCredential - The withdrawal credential associated with Lido.
   * @param earliestDepositsByPubkey - A map of the earliest deposit events with Lido wc by public key.
   * @returns An array of duplicated deposit events with non-Lido withdrawal credentials.
   */
  private getNonLidoDuplicatedDeposits(
    depositedEventsGroup: VerifiedDepositEventGroup,
    lidoWC: string,
    earliestLidoWCDepositsByPubkey: Record<string, VerifiedDepositEvent>,
  ): VerifiedDepositEvent[] {
    const nonLidoDuplicatedDeposits: VerifiedDepositEvent[] = [];

    const { events: depositedEvents } = depositedEventsGroup;

    depositedEvents.forEach((event) => {
      if (earliestLidoWCDepositsByPubkey[event.pubkey] && event.wc !== lidoWC) {
        nonLidoDuplicatedDeposits.push(event);
      }
    });

    this.logger.log('Non-Lido duplicated deposit events count', {
      count: nonLidoDuplicatedDeposits.length,
    });

    return nonLidoDuplicatedDeposits;
  }

  /**
   * Filters and returns valid duplicated deposit events from a given list.
   * @param nonLidoDuplicatedDeposits - An array of duplicated deposit events with non-Lido withdrawal credentials
   * @returns  An array of valid duplicated deposit events.
   */
  private getValidNonLidoDuplicatedDeposits(
    nonLidoDuplicatedDeposits: VerifiedDepositEvent[],
  ): VerifiedDepositEvent[] {
    const validNonLidoDuplicatedDeposits = nonLidoDuplicatedDeposits.filter(
      (event) => event.valid,
    );

    this.logger.log('Valid non-lido duplicated deposit events count', {
      count: validNonLidoDuplicatedDeposits.length,
    });

    return validNonLidoDuplicatedDeposits;
  }

  /**
   * Identifies and returns the public keys associated with deposit events that front-ran the deposits with lido withdrawal credentials.
   * @param validNonLidoDuplicatedDeposits - An array of duplicated deposit events with non-Lido withdrawal credentials.
   * @param earliestLidoWCDepositsByPubkey -  A map of the earliest deposit events with Lido withdrawal credentials by public key.
   * @returns An array of public keys for events that front-ran deposits with lido withdrawal credentials.
   */
  private getFrontRun(
    validNonLidoDuplicatedDeposits: VerifiedDepositEvent[],
    earliestLidoWCDepositsByPubkey: Record<string, VerifiedDepositEvent>,
  ): string[] {
    const frontRunnedDepositEvents = validNonLidoDuplicatedDeposits.filter(
      (suspectedEvent) => {
        // get event from lido map
        const sameKeyLidoDeposit =
          earliestLidoWCDepositsByPubkey[suspectedEvent.pubkey];

        // TODO: do we need to leave here this check
        if (!sameKeyLidoDeposit) throw new Error('expected event not found');

        return this.isFirstEventEarlier(suspectedEvent, sameKeyLidoDeposit);
      },
    );

    this.logger.log('Front-ran deposit events', {
      events: frontRunnedDepositEvents,
    });

    const frontRunnedDepositKeys = frontRunnedDepositEvents.map(
      ({ pubkey }) => pubkey,
    );

    return frontRunnedDepositKeys;
  }

  /**
   * Retrieves the keys associated with front-runned deposits that were previously deposited by Lido.
   *
   * @param frontRunnedDepositKeys - An array of public keys for events that front-ran deposits with lido withdrawal credentials.
   * @returns An array of registry keys that were previously deposited by Lido.
   */
  private async getKeysDepositedByLido(
    frontRunnedDepositKeys: string[],
  ): Promise<RegistryKey[]> {
    const { data: lidoDepositedKeys } =
      await this.keysApiService.getKeysByPubkeys(frontRunnedDepositKeys);

    return lidoDepositedKeys.filter((key) => key.used);
  }

  /**
   * Checks if Lido deposits have been front-ran in the past based on historical deposit data.
   * This method does not account for WC rotation as historical deposits were manually checked.
   *
   * @param depositedEvents - A group of historical deposit events.
   * @param lidoWC - The withdrawal credential associated with Lido.
   * @returns True if front-running was detected at any point in the past; false if no front-running occurred.
   */
  public async getHistoricalFrontRun(
    depositedEvents: VerifiedDepositEventGroup,
    lidoWC: string,
  ) {
    const lidoWCDeposits = this.getDepositsWithLidoWC(depositedEvents, lidoWC);

    const earliestDepositsMap = this.getEarliestDepositsMap(lidoWCDeposits);

    const nonLidoDuplicatedDeposits = this.getNonLidoDuplicatedDeposits(
      depositedEvents,
      lidoWC,
      earliestDepositsMap,
    );

    const validNonLidoDeposits = this.getValidNonLidoDuplicatedDeposits(
      nonLidoDuplicatedDeposits,
    );

    const frontRunnedDepositKeys = this.getFrontRun(
      validNonLidoDeposits,
      earliestDepositsMap,
    );

    if (frontRunnedDepositKeys.length === 0) {
      return false;
    }

    // front run happened only if these keys exist in lido contracts
    const frontRunnedLidoDeposits = await this.getKeysDepositedByLido(
      frontRunnedDepositKeys,
    );

    const hasFrontRunning = frontRunnedLidoDeposits.length > 0;

    if (hasFrontRunning) {
      this.logger.warn('Found historical front-run', {
        frontRunnedLidoDeposits,
      });
    }

    return hasFrontRunning;
  }

  public async alreadyPausedDeposits(blockData: BlockData, version: number) {
    if (version === 3) {
      const alreadyPaused = await this.securityService.isDepositsPaused({
        blockHash: blockData.blockHash,
      });

      return alreadyPaused;
    }

    // for earlier versions DSM contact didn't have this method
    // we check pause for every method via staking router contract
    return false;
  }

  /**
   * Return intersections with previously deposited keys
   */
  public getFrontRunAttempts(
    stakingModuleData: StakingModuleData,
    blockData: BlockData,
  ): RegistryKey[] {
    const keysIntersections = this.getKeysIntersections(
      stakingModuleData,
      blockData,
    );

    // if we have one ineligible and eligible events for the same key we should check which one was first
    // or we will report key for unvetting without reason
    // at the same time such vetted unused key will be reported as duplicated too
    const frontRunAttempts = this.excludeEligibleIntersections(
      blockData,
      keysIntersections,
    );

    this.guardianMetricsService.collectIntersectionsMetrics(
      stakingModuleData.stakingModuleId,
      keysIntersections,
      frontRunAttempts,
    );

    const keys = new Set(frontRunAttempts.map((deposit) => deposit.pubkey));

    // list can have duplicated keys
    return stakingModuleData.vettedUnusedKeys.filter((key) =>
      keys.has(key.key),
    );
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
    const {
      nonce,
      vettedUnusedKeys: keys,
      stakingModuleId,
    } = stakingModuleData;
    const vettedUnusedKeys = keys.map((key) => key.key);
    const vettedUnusedKeysSet = new Set(vettedUnusedKeys);
    const intersections = depositedEvents.events.filter(({ pubkey }) =>
      vettedUnusedKeysSet.has(pubkey),
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
   * @param blockData - collected data from the current block
   * @param intersections - list of deposits with keys that were deposited earlier
   */
  public excludeEligibleIntersections(
    blockData: BlockData,
    intersections: VerifiedDepositEvent[],
  ): VerifiedDepositEvent[] {
    return intersections.filter(
      ({ wc, valid }) => wc !== blockData.lidoWC && valid,
    );
  }

  public async handlePauseV3(blockData: BlockData): Promise<void> {
    const { blockNumber, blockHash, guardianAddress, guardianIndex } =
      blockData;

    const signature = await this.securityService.signPauseDataV3(
      blockNumber,
      blockHash,
    );

    const pauseMessage = {
      guardianAddress,
      guardianIndex,
      blockNumber,
      blockHash,
      signature,
    };

    this.logger.warn('Suspicious case detected, initialize the module pause', {
      blockNumber,
    });

    // Call pause without waiting for completion
    this.securityService
      .pauseDepositsV3(blockNumber, signature)
      .catch((error) => {
        this.logger.error('Pause trx failed', { blockNumber });
        this.logger.error(error);
      });

    await this.guardianMessageService.sendPauseMessageV3(pauseMessage);
  }

  /**
   * pause all modules, old version of contract
   */
  public async handlePauseV2(
    stakingModulesData: StakingModuleData[],
    blockData: BlockData,
  ) {
    for (const stakingModuleData of stakingModulesData) {
      if (this.isModuleAlreadyPaused(stakingModuleData, blockData)) {
        continue;
      }

      await this.pauseModuleDeposits(stakingModuleData, blockData);
      return; // Only process one transaction per handleNewBlock
    }
    return;
  }

  private isModuleAlreadyPaused(
    stakingModuleData: StakingModuleData,
    blockData: BlockData,
  ): boolean {
    if (stakingModuleData.isModuleDepositsPaused) {
      this.logger.log('Deposits are already paused for module', {
        blockHash: blockData.blockHash,
        stakingModuleId: stakingModuleData.stakingModuleId,
      });
      return true;
    }
    return false;
  }

  /**
   * pause module
   * @param blockData - collected data from the current block
   */
  public async pauseModuleDeposits(
    stakingModuleData: StakingModuleData,
    blockData: BlockData,
  ): Promise<void> {
    const { nonce, stakingModuleId } = stakingModuleData;

    this.logger.warn('Pause deposits for module', {
      blockHash: blockData.blockHash,
      stakingModuleId,
    });

    const {
      blockNumber,
      blockHash,
      guardianAddress,
      guardianIndex,
      depositRoot,
    } = blockData;

    const signature = await this.securityService.signPauseDataV2(
      blockNumber,
      blockHash,
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

    // Call pause without waiting for completion
    this.securityService
      .pauseDepositsV2(blockNumber, stakingModuleId, signature)
      .catch((error) => this.logger.error(error));

    await this.guardianMessageService.sendPauseMessageV2(pauseMessage);
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

    const currentContractState = {
      nonce,
      depositRoot,
      blockNumber,
      lastChangedBlockHash,
    };

    const lastContractsState =
      this.lastContractsStateByModuleId[stakingModuleId];

    const isSameContractsState = this.isSameContractsStates(
      currentContractState,
      lastContractsState,
    );

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

    this.lastContractsStateByModuleId[stakingModuleId] = currentContractState;
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

    // If the nonce is unchanged, the state might still have changed due to a reorganization.
    // Therefore, we need to compare the 'lastChangedBlockHash' instead.
    // It's important to note that the nonce cannot be different while having the same 'lastChangedBlockHash'.
    // Additionally, it's important to note that 'lastChangedBlockHash' will change not only during key update-related events,
    // but also when a node operator is added, when node operator data is changed, during a reorganization, and so on.
    // TODO: We may need to reconsider this approach for the Data Bus.
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
