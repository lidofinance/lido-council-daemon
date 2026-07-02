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
import { DeepReadonly } from 'common/ts-utils';
import { Configuration } from 'common/config';
import { getLegacyModuleWCs } from '../withdrawal-credentials';

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
    private config: Configuration,
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
   * Build a map of used lido keys to the withdrawal credentials that are
   * acceptable for them: the module's current WC plus any legacy WCs the module
   * legitimately used in the past (e.g. the pre-Merge 0x00 BLS WC). The earliest
   * deposit of a used key may still be bound to a legacy WC, so it must be
   * treated as a valid lido WC and not reported as a front-run.
   */
  private getUsedKeyAcceptableWCs(
    lidoKeys: DeepReadonly<RegistryKey[]>,
    moduleAddressToWC: DeepReadonly<Record<string, string>>,
  ): Map<string, Set<string>> {
    const usedKeyAcceptableWCs = new Map<string, Set<string>>();
    for (const key of lidoKeys) {
      if (key.used) {
        const expectedWC = moduleAddressToWC[key.moduleAddress];
        if (!expectedWC) throw new Error('Unexpected module address');
        const legacyWCs = getLegacyModuleWCs(
          this.config.CHAIN_ID,
          key.moduleAddress,
        );
        usedKeyAcceptableWCs.set(key.key, new Set([expectedWC, ...legacyWCs]));
      }
    }
    return usedKeyAcceptableWCs;
  }

  /**
   * Find the earliest valid deposit event for each used lido key
   */
  private getEarliestDeposits(
    depositedEvents: VerifiedDepositEventGroup,
    usedKeyAcceptableWCs: Map<string, Set<string>>,
  ): Map<string, VerifiedDepositEvent> {
    const earliestDeposits = new Map<string, VerifiedDepositEvent>();
    for (const event of depositedEvents.events) {
      if (!event.valid) continue;
      if (!usedKeyAcceptableWCs.has(event.pubkey)) continue;

      const existing = earliestDeposits.get(event.pubkey);
      if (!existing || this.isFirstEventEarlier(event, existing)) {
        earliestDeposits.set(event.pubkey, event);
      }
    }
    return earliestDeposits;
  }

  /**
   * Check if any used lido key has earliest deposit with non-lido withdrawal credentials (theft)
   */
  public checkHistoricalFrontRun(
    depositedEvents: VerifiedDepositEventGroup,
    lidoKeys: DeepReadonly<RegistryKey[]>,
    moduleAddressToWC: DeepReadonly<Record<string, string>>,
  ): boolean {
    const usedKeyAcceptableWCs = this.getUsedKeyAcceptableWCs(
      lidoKeys,
      moduleAddressToWC,
    );
    const earliestDeposits = this.getEarliestDeposits(
      depositedEvents,
      usedKeyAcceptableWCs,
    );
    const lidoWCs = new Set(Object.values(moduleAddressToWC));

    const frontRunnedKeys: string[] = [];
    for (const [pubkey, event] of earliestDeposits) {
      const acceptableWCs = usedKeyAcceptableWCs.get(pubkey);
      // A legacy WC (e.g. the pre-Merge 0x00 BLS WC) is a valid lido WC even
      // though the module's current WC has since rotated, so skip it here.
      if (acceptableWCs?.has(event.wc)) continue;
      if (!lidoWCs.has(event.wc)) {
        frontRunnedKeys.push(pubkey);
      }
    }

    this.guardianMetricsService.collectHistoricalFrontRunMetrics(
      frontRunnedKeys.length,
    );

    if (frontRunnedKeys.length > 0) {
      this.logger.warn('Found historical front-run', { frontRunnedKeys });
    }

    return frontRunnedKeys.length > 0;
  }

  /**
   * Check if any used lido key has earliest deposit with lido WC but wrong type
   * (e.g. 0x01 instead of 0x02 or vice versa)
   */
  public checkWrongWCType(
    depositedEvents: VerifiedDepositEventGroup,
    lidoKeys: DeepReadonly<RegistryKey[]>,
    moduleAddressToWC: DeepReadonly<Record<string, string>>,
  ): boolean {
    const usedKeyAcceptableWCs = this.getUsedKeyAcceptableWCs(
      lidoKeys,
      moduleAddressToWC,
    );
    const earliestDeposits = this.getEarliestDeposits(
      depositedEvents,
      usedKeyAcceptableWCs,
    );
    const lidoWCs = new Set(Object.values(moduleAddressToWC));

    const wrongWCTypeKeys: string[] = [];
    for (const [pubkey, event] of earliestDeposits) {
      const acceptableWCs = usedKeyAcceptableWCs.get(pubkey);
      // Acceptable WCs (current + legacy) are fine; only a lido WC that is
      // neither is a wrong-type deposit.
      if (acceptableWCs?.has(event.wc)) continue;
      if (lidoWCs.has(event.wc)) {
        wrongWCTypeKeys.push(pubkey);
      }
    }

    this.guardianMetricsService.collectWrongWCTypeMetrics(
      wrongWCTypeKeys.length,
    );

    if (wrongWCTypeKeys.length > 0) {
      this.logger.warn(
        'Found deposited keys with wrong withdrawal credentials type',
        { wrongWCTypeKeys },
      );
    }

    return wrongWCTypeKeys.length > 0;
  }

  /**
   * Return intersections with previously deposited keys
   */
  public getFrontRunAttempts(
    stakingModuleData: StakingModuleData,
    blockData: BlockData,
    lidoWCSet: Set<string>,
  ): { frontRunKeys: RegistryKey[]; crossTypeKeys: RegistryKey[] } {
    const keysIntersections = this.getKeysIntersections(
      stakingModuleData,
      blockData,
    );
    const moduleWC = stakingModuleData.withdrawalCredentials;

    const frontRunPubkeys = new Set<string>();
    const crossTypePubkeys = new Set<string>();

    for (const event of keysIntersections) {
      if (!event.valid) continue;
      if (event.wc === moduleWC) continue;

      if (lidoWCSet.has(event.wc)) {
        crossTypePubkeys.add(event.pubkey);
      } else {
        frontRunPubkeys.add(event.pubkey);
      }
    }

    this.guardianMetricsService.collectIntersectionsMetrics(
      stakingModuleData.stakingModuleId,
      keysIntersections.length,
      frontRunPubkeys.size + crossTypePubkeys.size,
      crossTypePubkeys.size,
    );

    return {
      frontRunKeys: stakingModuleData.vettedUnusedKeys.filter((k) =>
        frontRunPubkeys.has(k.key),
      ),
      crossTypeKeys: stakingModuleData.vettedUnusedKeys.filter((k) =>
        crossTypePubkeys.has(k.key),
      ),
    };
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
      hasFrontRunning: blockData.hasFrontRunning,
      hasWrongWCType: blockData.hasWrongWCType,
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
  ): Promise<RegistryKey[]> {
    this.logger.log('Start keys validation', {
      keysCount: stakingModuleData.vettedUnusedKeys.length,
      stakingModuleId: stakingModuleData.stakingModuleId,
    });

    // TODO: move to decorator
    const validationTimeStart = performance.now();

    const invalidKeysList = await this.keysValidationService.getInvalidKeys(
      stakingModuleData.vettedUnusedKeys,
      stakingModuleData.withdrawalCredentials,
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
