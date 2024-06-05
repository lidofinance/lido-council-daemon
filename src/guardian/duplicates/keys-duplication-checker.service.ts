import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { SigningKeyEventsCacheService } from 'contracts/signing-key-events-cache';
import { SigningKeyEvent } from 'contracts/signing-key-events-cache/interfaces/event.interface';
import { BlockData } from 'guardian/interfaces';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

@Injectable()
export class KeysDuplicationCheckerService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private signingKeyEventsCacheService: SigningKeyEventsCacheService,
  ) {}

  /**
   * Identifies and returns duplicated keys.
   *
   * Duplicates Search Algorithm:
   * 1. If there are duplicates within one operator, the key with the lowest index is considered the original, and the others are considered duplicates.
   * 2. If there are duplicates between different operators, check if a deposited key exists in the duplicates list; all others are considered duplicates.
   * 3. If there is no deposited key, check the SigningKeyAdded events for operators.
   * 4. Sort events by block number and logIndex. The earliest event is considered the original, and the others are marked as duplicates.
   *
   * If there is no event for the key it will return list of unresolved keys.
   */
  async getDuplicatedKeys(
    keys: RegistryKey[],
    blockData: BlockData,
  ): Promise<{ duplicates: RegistryKey[]; unresolved: RegistryKey[] }> {
    // List of all duplicates
    // First element of sub-arrays is a key, second - all it's occurrences
    const duplicatedKeys = this.findDuplicateKeys(keys);
    const duplicates: RegistryKey[] = [];
    const unresolved: RegistryKey[] = [];

    for (const [key, occurrences] of duplicatedKeys) {
      const operators = this.extractOperators(occurrences);

      // Case: Duplicates across one operator
      if (operators.size == 1) {
        duplicates.push(...this.findDuplicatesWithinOperator(occurrences));

        continue;
      }

      // Case: Deposited keys
      if (occurrences.some((key) => key.used)) {
        duplicates.push(...occurrences.filter((key) => !key.used));
        continue;
      }

      // Case: Duplicates across multiple operators
      const { duplicateKeys, missingEvents } =
        await this.handleDuplicatesAcrossOperators(
          key,
          occurrences,
          operators,
          blockData,
        );

      duplicates.push(...duplicateKeys);
      unresolved.push(...missingEvents);
    }
    return { duplicates, unresolved };
  }

  public findDuplicateKeys(keys: RegistryKey[]): [string, RegistryKey[]][] {
    const keyOccurrencesMap = keys.reduce((acc, key) => {
      const occurrences = acc.get(key.key) || [];
      occurrences.push(key);
      acc.set(key.key, occurrences);

      return acc;
    }, new Map<string, RegistryKey[]>());

    return Array.from(keyOccurrencesMap.entries()).filter(
      ([, occurrences]) => occurrences.length > 1,
    );
  }

  private extractOperators(occurrences: RegistryKey[]): Set<string> {
    return new Set(
      occurrences.map((key) => `${key.moduleAddress}-${key.operatorIndex}`),
    );
  }

  private findDuplicatesWithinOperator(
    operatorKeys: RegistryKey[],
  ): RegistryKey[] {
    // Assuming keys belong to a single operator
    const originalKey = this.findOriginalKeyWithinOperator(operatorKeys);
    return operatorKeys.filter((key) => key.index !== originalKey.index);
  }

  private findOriginalKeyWithinOperator(
    operatorKeys: RegistryKey[],
  ): RegistryKey {
    return operatorKeys.reduce(
      (prev, curr) => (prev.index < curr.index ? prev : curr),
      operatorKeys[0],
    );
  }

  private async handleDuplicatesAcrossOperators(
    key: string,
    occurrences: RegistryKey[],
    operators: Set<string>,
    blockData: BlockData,
  ) {
    const events = await this.fetchSigningKeyEvents(key, blockData);

    const missingOperators = this.findMissingOperators(operators, events);

    if (missingOperators.length) {
      this.logger.error('Missing events for operators', {
        missingOperators,
        currentBlockNumber: blockData.blockNumber,
        currentBlockHash: blockData.blockHash,
      });
      // Return the entire occurrence set as unresolved
      return { duplicateKeys: [], missingEvents: occurrences };
    }

    const originalEvent = this.findOriginalEvent(events);
    const originalKey = this.findOriginalKey(occurrences, originalEvent);

    this.logger.log('Original key is', {
      ...{
        originalKey,
        createBlockNumber: originalEvent.blockNumber,
        createBlockHash: originalEvent.blockHash,
        createLogIndex: originalEvent.logIndex,
      },
      currentBlockNumber: blockData.blockNumber,
      currentBlockHash: blockData.blockHash,
    });
    const duplicateKeys = occurrences.filter(
      (k) => !this.isSameKey(k, originalKey),
    );

    return { duplicateKeys, missingEvents: [] };
  }

  private async fetchSigningKeyEvents(
    key: string,
    blockData: BlockData,
  ): Promise<SigningKeyEvent[]> {
    const { events } =
      await this.signingKeyEventsCacheService.getUpdatedSigningKeyEvents(
        key,
        blockData.blockNumber,
        blockData.blockHash,
      );
    return events;
  }

  private findOriginalEvent(events: SigningKeyEvent[]): SigningKeyEvent {
    return events.reduce(
      (prev, curr) =>
        prev.blockNumber < curr.blockNumber ||
        (prev.blockNumber === curr.blockNumber && prev.logIndex < curr.logIndex)
          ? prev
          : curr,
      events[0],
    );
  }

  private findOriginalKey(
    occurrences: RegistryKey[],
    originalEvent: SigningKeyEvent,
  ): RegistryKey {
    const keyOwnerKeys = occurrences.filter(
      (key) =>
        key.moduleAddress === originalEvent.moduleAddress &&
        key.operatorIndex === originalEvent.operatorIndex,
    );
    return this.findOriginalKeyWithinOperator(keyOwnerKeys);
  }

  private findMissingOperators(
    operators: Set<string>,
    events: SigningKeyEvent[],
  ): string[] {
    const eventOperators = new Set(
      events.map((event) => `${event.moduleAddress}-${event.operatorIndex}`),
    );
    return [...operators].filter((op) => !eventOperators.has(op));
  }

  private isSameKey(key1: RegistryKey, key2: RegistryKey): boolean {
    return (
      key1.moduleAddress === key2.moduleAddress &&
      key1.operatorIndex === key2.operatorIndex &&
      key1.index === key2.index
    );
  }
}
