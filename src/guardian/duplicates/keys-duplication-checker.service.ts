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
   * What if there is no event for the key? This might indicate that the node returned an incorrect answer, the module didn't implement SigningKeyAdded, or there is a mistake in the cache algorithm. Should we throw an error?
   *
   * TODO: If there is no event for the key, should it be considered added in block 0? (Should this be done only for the curated module?)
   */
  async getDuplicatedKeys(
    keys: RegistryKey[],
    blockData: BlockData,
  ): Promise<RegistryKey[]> {
    // List of all duplicates
    // First element of subarrays is a key, second - all it's occurrences
    const duplicatedKeys: [string, RegistryKey[]][] =
      this.findDuplicateKeys(keys);
    const duplicates: RegistryKey[] = [];

    for (const [key, occurrences] of duplicatedKeys) {
      const operators = new Set(
        occurrences.map((key) => `${key.moduleAddress}-${key.operatorIndex}`),
      );

      // Case: Duplicates across one operator
      if (operators.size == 1) {
        duplicates.push(...this.findDuplicatesWithinOperator(occurrences));

        continue;
      }

      // Case: Deposited keys
      if (occurrences.some((key) => key.used)) {
        duplicates.push(...this.filterNonDepositedKeys(occurrences));
        continue;
      }

      // Case: Duplicates across multiple operators
      const events = await this.fetchSigningKeyEvents(key, blockData);
      const originalEvent = this.findOriginalEvent(events);

      this.checkMissingOperators(operators, events, blockData); // Sanity check for operator events

      // Case: owner of original key has duplicated keys
      const keyOwnerKeys = occurrences.filter(
        (key) =>
          key.moduleAddress === originalEvent.moduleAddress &&
          key.operatorIndex === originalEvent.operatorIndex,
      );

      const originalKey = this.findOriginalKeyWithinOperator(keyOwnerKeys);

      this.logger.log('Original key is', {
        ...{
          originalKey,
          createBlockNumber: originalEvent.blockNumber,
          createBlockHash: originalEvent.blockHash,
          createLogINdex: originalEvent.logIndex,
        },
        currentBlockNumber: blockData.blockNumber,
        currentBlockhash: blockData.blockHash,
      });

      duplicates.push(
        ...occurrences.filter((k) => !this.isSameKey(k, originalKey)),
      );
    }
    return duplicates;
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

  private filterNonDepositedKeys(occurrences: RegistryKey[]): RegistryKey[] {
    return occurrences.filter((key) => !key.used);
  }

  private findOriginalKeyWithinOperator(
    operatorKeys: RegistryKey[],
  ): RegistryKey {
    return operatorKeys.reduce(
      (prev, curr) => (prev.index < curr.index ? prev : curr),
      operatorKeys[0],
    );
  }

  private findDuplicatesWithinOperator(
    operatorKeys: RegistryKey[],
  ): RegistryKey[] {
    // Assuming keys belong to a single operator
    const originalKey = this.findOriginalKeyWithinOperator(operatorKeys);
    return operatorKeys.filter((key) => key.index !== originalKey.index);
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

  private findOriginalEvent(events: any[]): any {
    return events.reduce(
      (prev, curr) =>
        prev.blockNumber < curr.blockNumber ||
        (prev.blockNumber === curr.blockNumber && prev.logIndex < curr.logIndex)
          ? prev
          : curr,
      events[0],
    );
  }

  /**
   * Sanity check to ensure all operators have corresponding events.
   */
  private checkMissingOperators(
    operators: Set<string>,
    events: any[],
    blockData: BlockData,
  ) {
    const eventOperators = new Set(
      events.map((event) => `${event.moduleAddress}-${event.operatorIndex}`),
    );
    const missingOperators = [...operators].filter(
      (op) => !eventOperators.has(op),
    );

    if (missingOperators.length) {
      this.logger.error('Missing events for operators', {
        missingOperators,
        currentBlockNumber: blockData.blockNumber,
        currentBlockhash: blockData.blockHash,
      });
      throw new Error('Missing events for some operators');
    }
  }

  private isSameKey(key1: RegistryKey, key2: RegistryKey): boolean {
    return (
      key1.moduleAddress === key2.moduleAddress &&
      key1.operatorIndex === key2.operatorIndex &&
      key1.index === key2.index
    );
  }
}
