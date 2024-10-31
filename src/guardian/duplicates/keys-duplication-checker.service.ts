import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { DeepReadonly } from 'common/ts-utils';
import {
  SigningKeyEvent,
  SigningKeyEventsGroupWithStakingModules,
} from 'contracts/signing-keys-registry/interfaces/event.interface';
import { SigningKeysRegistryService } from 'contracts/signing-keys-registry/signing-keys-registry.service';

import { BlockData } from 'guardian/interfaces';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { rangePromise } from 'utils';

const BATCH_SIZE = 10;

@Injectable()
export class KeysDuplicationCheckerService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private signingKeysRegistryService: SigningKeysRegistryService,
  ) {}

  /**
   * Identifies and returns duplicated keys.
   *
   * Duplicates Search Algorithm:
   * 1. If there are duplicates within one operator, the key with the lowest index is considered the original, and the others are considered duplicates.
   * 2. If there are duplicates between different operators, check if a deposited key exists in the duplicates list; all others are considered duplicates.
   * 3. If there is no deposited key, check the SigningKeyAdded events for operators.
   * 4. Sort events by block number. The earliest event is considered the original, and the others are marked as duplicates.
   *
   * If there is no event for the key it will return list of unresolved keys.
   *
   * @param key public key
   * @param blockData - collected data from the current block
   * @returns An object containing two properties:
   *   - `duplicates`: An array of `RegistryKey` objects that are identified as duplicates.
   *   - `unresolved`: An array of `RegistryKey` objects for which no corresponding events were found.
   */
  public async getDuplicatedKeys(
    keys: DeepReadonly<RegistryKey[]>,
    blockData: BlockData,
  ): Promise<{ duplicates: RegistryKey[]; unresolved: RegistryKey[] }> {
    if (keys.length === 0) {
      return { duplicates: [], unresolved: [] };
    }
    // First element of sub-arrays is a key, second - all it's occurrences
    const suspectedDuplicateKeyGroups = this.getDuplicateKeyGroups(keys);

    const processDuplicateGroup = async (index) => {
      const [key, suspectedDuplicateKeys] = suspectedDuplicateKeyGroups[index];
      return await this.processDuplicateKeyGroup(
        key,
        suspectedDuplicateKeys,
        blockData,
      );
    };

    const result = await rangePromise(
      processDuplicateGroup,
      0,
      suspectedDuplicateKeyGroups.length,
      BATCH_SIZE,
    );

    const duplicates = result.flatMap(({ duplicates }) => duplicates);
    const unresolved = result.flatMap(({ unresolved }) => unresolved);

    return { duplicates, unresolved };
  }

  /**
   * Groups keys by their pubkey and returns a list of those with duplicates.
   *
   * This method iterates over the provided keys and groups them by their unique pubkey.
   * It then filters out any groups that do not have duplicates, returning only the groups
   * that contain more than one instance of the pubkey.
   *
   * @param keys - An array of `RegistryKey` objects to be checked for duplicates.
   * @returns An array of tuples where each tuple contains a pubkey string and an array of
   *          `RegistryKey` objects that share that pubkey. Only keys with duplicates are included.
   */
  public getDuplicateKeyGroups(
    keys: DeepReadonly<RegistryKey[]>,
  ): [string, RegistryKey[]][] {
    const keyMap = keys.reduce((acc, key) => {
      const duplicateKeys = acc.get(key.key) || [];
      duplicateKeys.push(key);
      acc.set(key.key, duplicateKeys);

      return acc;
    }, new Map<string, RegistryKey[]>());

    return Array.from(keyMap.entries()).filter(
      ([, duplicateKeys]) => duplicateKeys.length > 1,
    );
  }

  private async processDuplicateKeyGroup(
    key: string,
    suspectedDuplicateKeys: RegistryKey[],
    blockData: BlockData,
  ): Promise<{ duplicates: RegistryKey[]; unresolved: RegistryKey[] }> {
    const uniqueOperatorIdentifiers = this.getUniqueIdentifiersForOperators(
      suspectedDuplicateKeys,
    );

    if (uniqueOperatorIdentifiers.length === 1) {
      return this.handleSingleOperatorDuplicates(suspectedDuplicateKeys);
    }

    if (this.hasDepositedKey(suspectedDuplicateKeys)) {
      return this.handleDepositedKeyDuplicates(suspectedDuplicateKeys);
    }

    return await this.handleMultiOperatorDuplicates(
      key,
      suspectedDuplicateKeys,
      uniqueOperatorIdentifiers,
      blockData,
    );
  }

  private getUniqueIdentifiersForOperators(keys: RegistryKey[]): string[] {
    return [...new Set(keys.map((key) => this.getKeyOperatorIdentifier(key)))];
  }

  private getKeyOperatorIdentifier(key: RegistryKey): string {
    return `${key.moduleAddress}-${key.operatorIndex}`;
  }

  private handleSingleOperatorDuplicates(
    suspectedDuplicateKeys: RegistryKey[],
  ): {
    duplicates: RegistryKey[];
    unresolved: RegistryKey[];
  } {
    const duplicates = this.findDuplicatesWithinOperator(
      suspectedDuplicateKeys,
    );
    return { duplicates, unresolved: [] };
  }

  private handleDepositedKeyDuplicates(suspectedDuplicateKeys: RegistryKey[]): {
    duplicates: RegistryKey[];
    unresolved: RegistryKey[];
  } {
    const duplicates = suspectedDuplicateKeys.filter((key) => !key.used);
    return { duplicates, unresolved: [] };
  }

  private async handleMultiOperatorDuplicates(
    key: string,
    suspectedDuplicateKeys: RegistryKey[],
    uniqueOperatorIdentifiers: string[],
    blockData: BlockData,
  ) {
    const { duplicateKeys, unresolvedKeys } =
      await this.getDuplicatesAcrossOperators(
        key,
        suspectedDuplicateKeys,
        uniqueOperatorIdentifiers,
        blockData,
      );
    return { duplicates: duplicateKeys, unresolved: unresolvedKeys };
  }

  private findDuplicatesWithinOperator(
    operatorKeys: RegistryKey[],
  ): RegistryKey[] {
    // Assuming keys belong to a single operator
    const earliestKey = this.findEarliestKeyWithinOperator(operatorKeys);
    return operatorKeys.filter((key) => key.index !== earliestKey.index);
  }

  private findEarliestKeyWithinOperator(
    operatorKeys: RegistryKey[],
  ): RegistryKey {
    return operatorKeys.reduce(
      (prev, curr) => (prev.index < curr.index ? prev : curr),
      operatorKeys[0],
    );
  }

  private hasDepositedKey(keys: RegistryKey[]): boolean {
    return keys.some((key) => key.used);
  }

  private async getDuplicatesAcrossOperators(
    key: string,
    suspectedDuplicateKeys: RegistryKey[],
    uniqueOperatorIdentifiers: string[],
    blockData: BlockData,
  ) {
    const { events } = await this.fetchSigningKeyEvents(key, blockData);

    const operatorsWithoutEvents = this.getOperatorsWithoutEvents(
      uniqueOperatorIdentifiers,
      events,
    );

    if (operatorsWithoutEvents.length) {
      this.logger.error('Missing events for operators', {
        operatorsWithoutEvents,
        currentBlockNumber: blockData.blockNumber,
        currentBlockHash: blockData.blockHash,
      });
      // Return the entire list of duplicates as unresolved
      return { duplicateKeys: [], unresolvedKeys: suspectedDuplicateKeys };
    }

    return this.handleEventsForDuplicates(
      events,
      suspectedDuplicateKeys,
      blockData,
    );
  }

  private handleEventsForDuplicates(
    events: SigningKeyEvent[],
    suspectedDuplicateKeys: RegistryKey[],
    blockData: BlockData,
  ) {
    const earliestEvents = this.findEarliestEvents(events);

    // have only one event
    if (earliestEvents.length === 1) {
      const earliestEvent = earliestEvents[0];

      const duplicateKeys = this.filterNonEarliestKeys(
        earliestEvent,
        suspectedDuplicateKeys,
        blockData,
      );

      return { duplicateKeys, unresolvedKeys: [] };
    }

    // If there are few events at the same block
    // There can be an attempt to front-run the key submission transaction,
    // in this case, it's difficult to determine who was first,
    // therefore it is proposed to unvet the entire set of duplicates.
    // If trying to look at the log index, then a malicious actor can make a back-run
    return { duplicateKeys: suspectedDuplicateKeys, unresolvedKeys: [] };
  }

  private async fetchSigningKeyEvents(
    key: string,
    blockData: BlockData,
  ): Promise<SigningKeyEventsGroupWithStakingModules> {
    const eventsGroup =
      await this.signingKeysRegistryService.getUpdatedSigningKeyEvents(
        key,
        blockData.blockNumber,
        blockData.blockHash,
      );

    return eventsGroup;
  }

  private getOperatorsWithoutEvents(
    uniqueOperatorIdentifiers: string[],
    events: SigningKeyEvent[],
  ): string[] {
    const eventOperators = new Set(
      events.map((event) => `${event.moduleAddress}-${event.operatorIndex}`),
    );
    return uniqueOperatorIdentifiers.filter(
      (operatorIdentifier) => !eventOperators.has(operatorIdentifier),
    );
  }

  private filterNonEarliestKeys(
    earliestEvent: SigningKeyEvent,
    suspectedDuplicateKeys: RegistryKey[],
    blockData: BlockData,
  ) {
    const operatorKeys = this.findOperatorKeys(
      suspectedDuplicateKeys,
      earliestEvent.moduleAddress,
      earliestEvent.operatorIndex,
    );

    const earliestKey = this.findEarliestKeyWithinOperator(operatorKeys);

    this.logger.log('Earliest key is', {
      earliestKey,
      createBlockNumber: earliestEvent.blockNumber,
      createBlockHash: earliestEvent.blockHash,
      currentBlockNumber: blockData.blockNumber,
      currentBlockHash: blockData.blockHash,
    });
    return suspectedDuplicateKeys.filter(
      (key) => !this.isSameKey(key, earliestKey),
    );
  }

  private findEarliestEvents(events: SigningKeyEvent[]): SigningKeyEvent[] {
    if (events.length <= 1) return events;

    const { blockEvents } = events.reduce(
      ({ earliestBlockNumber, blockEvents }, currEvent) => {
        if (earliestBlockNumber === currEvent.blockNumber) {
          blockEvents.push(currEvent);
          return {
            earliestBlockNumber,
            blockEvents,
          };
        }

        if (earliestBlockNumber > currEvent.blockNumber) {
          return {
            earliestBlockNumber: currEvent.blockNumber,
            blockEvents: [currEvent],
          };
        }

        return { earliestBlockNumber, blockEvents };
      },
      {
        earliestBlockNumber: events[0].blockNumber,
        blockEvents: [],
      } as { earliestBlockNumber: number; blockEvents: SigningKeyEvent[] },
    );

    return blockEvents;
  }

  private findOperatorKeys(
    keys: RegistryKey[],
    moduleAddress: string,
    operatorIndex: number,
  ): RegistryKey[] {
    return keys.filter(
      (key) =>
        key.moduleAddress === moduleAddress &&
        key.operatorIndex === operatorIndex,
    );
  }

  private isSameKey(key1: RegistryKey, key2: RegistryKey): boolean {
    return (
      key1.moduleAddress === key2.moduleAddress &&
      key1.operatorIndex === key2.operatorIndex &&
      key1.index === key2.index
    );
  }
}
