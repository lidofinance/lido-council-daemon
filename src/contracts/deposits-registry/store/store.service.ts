import { Inject, Injectable } from '@nestjs/common';
import { Level } from 'level';
import { join } from 'path';
import {
  DB_DIR,
  DB_DEFAULT_VALUE,
  MAX_DEPOSIT_COUNT,
  DB_LAYER_DIR,
} from './store.constants';
import { ProviderService } from 'provider';
import {
  VerifiedDepositEvent,
  VerifiedDepositEventsCache,
  VerifiedDepositEventsCacheHeaders,
} from '../interfaces';

@Injectable()
export class DepositsRegistryStoreService {
  private db!: Level<string, string>;
  constructor(
    private providerService: ProviderService,
    @Inject(DB_DIR) private cacheDir: string,
    @Inject(DB_LAYER_DIR) private cacheLayerDir: string,
    @Inject(DB_DEFAULT_VALUE)
    private cacheDefaultValue: {
      data: VerifiedDepositEvent[];
      headers: VerifiedDepositEventsCacheHeaders;
    },
  ) {}

  public async initialize() {
    await this.setupLevel();
  }

  /**
   * Initializes LevelDB with JSON encoding at the cache directory path.
   *
   * @returns {Promise<void>} A promise that resolves when the database is successfully initialized.
   * @private
   */
  private async setupLevel() {
    this.db = new Level(await this.getDBDirPath(), {
      valueEncoding: 'json',
    });
    await this.db.open();
  }

  /**
   * Fetches and constructs the cache directory path for the current blockchain network.
   *
   * @returns {Promise<string>} A promise that resolves to the full path of the network-specific cache directory.
   * @private
   */
  private async getDBDirPath(): Promise<string> {
    const chainId = await this.providerService.getChainId();
    const networkDir = `chain-${chainId}`;

    return join(this.cacheDir, this.cacheLayerDir, networkDir);
  }

  /**
   * Asynchronously retrieves deposit events and headers from the database.
   * Iterates through entries starting with 'deposit:' to collect data and fetches headers stored under 'header'.
   * Handles errors by logging and returning default cache values.
   *
   * @returns {Promise<{data: VerifiedDepositEvent[], headers: VerifiedDepositEventsCacheHeaders}>} Cache data and headers.
   * @public
   */
  public async getEventsCache(): Promise<{
    data: VerifiedDepositEvent[];
    headers: VerifiedDepositEventsCacheHeaders;
    lastValidEvent?: VerifiedDepositEvent;
  }> {
    try {
      const stream = this.db.iterator({ gte: 'deposit:', lte: 'deposit:\xFF' });

      const data: VerifiedDepositEvent[] = [];

      for await (const [, value] of stream) {
        data.push(this.parseDepositEvent(value));
      }
      const headers: VerifiedDepositEventsCacheHeaders = JSON.parse(
        await this.db.get('headers'),
      );

      const lastValidEvent = await this.getLastValidEvent();

      return { data, headers, lastValidEvent };
    } catch (error: any) {
      if (error.code === 'LEVEL_NOT_FOUND') return this.cacheDefaultValue;
      throw error;
    }
  }

  /**
   * Retrieves the last valid deposit event from the database.
   * This method queries the database for the 'last-valid-event' key to fetch the most recent
   * valid event and parses it into a `VerifiedDepositEvent` object.
   *
   * @returns {Promise<VerifiedDepositEvent | undefined>} A promise that resolves to the last valid `VerifiedDepositEvent` object
   * or `undefined` if no event is found or if the event could not be retrieved (e.g., key does not exist).
   *
   * @throws {Error} Throws an error if there is a database access issue other than a 'LEVEL_NOT_FOUND' error code.
   */
  public async getLastValidEvent(): Promise<VerifiedDepositEvent | undefined> {
    try {
      const lastValidEvent = await this.db.get('last-valid-event');
      return this.parseDepositEvent(lastValidEvent);
    } catch (error: any) {
      if (error.code === 'LEVEL_NOT_FOUND') return undefined;
      throw error;
    }
  }

  /**
   * Clears all deposit records from the database starting from the deposit count of the last valid event.
   * If no valid event is found, it will clear deposits greater than deposit count zero.
   * This method leverages the `deleteDepositsGreaterThanNBatch` method for batch deletion.
   * @returns {Promise<void>} A promise that resolves when all appropriate deposits have been deleted.
   */
  public async clearFromLastValidEvent(): Promise<void> {
    const lastValidEvent = await this.getLastValidEvent();

    // Determine the starting index for deletion based on the last valid event's deposit count
    const fromIndex = lastValidEvent ? lastValidEvent.depositCount : 0;

    // Delete all deposits from the determined index onwards
    await this.deleteDepositsGreaterThanNBatch(fromIndex);
  }

  /**
   * Deletes all deposit records from the database with keys greater than a specified number.
   * @param {number} depositCount - The number above which deposit keys will be deleted.
   * @returns {Promise<void>} A promise that resolves when the operation is complete.
   */
  public async deleteDepositsGreaterThanNBatch(
    depositCount: number,
  ): Promise<void> {
    // Generate the upper boundary key for deletion
    const upperBoundKey = this.generateDepositKey(depositCount);

    // Initialize the iterator starting from the upper boundary key
    const stream = this.db.iterator({ gt: upperBoundKey, lte: 'deposit:\xFF' });

    // Initialize an array to hold batch operations
    const ops: { type: 'del'; key: string }[] = [];

    // Populate the batch operations array with delete operations
    for await (const [key] of stream) {
      ops.push({
        type: 'del',
        key: key,
      });
    }

    // Execute the batch operation if there are any operations to perform
    if (ops.length > 0) {
      await this.db.batch(ops);
    }
  }

  /**
   * Generates a deposit key string based on a given number.
   * The number is checked to ensure it falls within a valid range (from 0 up to MAX_DEPOSIT_COUNT).
   * If the number is out of bounds, an error is thrown.
   * The method creates a buffer, writes the number to the buffer in big-endian format,
   * and returns a deposit key string that includes the hexadecimal representation of the number.
   *
   * @param {number} number - The number used to generate the deposit key.
   * @returns {string} The deposit key in the format 'deposit:XXXX', where 'XXXX' is the hexadecimal representation of the number.
   * @throws {Error} If the number is less than 0 or greater than MAX_DEPOSIT_COUNT.
   * @private
   */
  private generateDepositKey(number: number): string {
    if (number < 0 || number > MAX_DEPOSIT_COUNT) {
      throw new Error(
        `Deposit count is out of the valid range (0 to ${MAX_DEPOSIT_COUNT}) received ${number}`,
      );
    }
    const index = Buffer.alloc(4);
    index.writeUInt32BE(number, 0);
    return `deposit:${index.toString('hex')}`;
  }

  /**
   * Parses a JSON string to a VerifiedDepositEvent, adding a Uint8Array for the depositDataRoot.
   *
   * @param {string} dataString - The JSON string representing a deposit event.
   * @returns {VerifiedDepositEvent} The parsed deposit event.
   * @private
   */
  private parseDepositEvent(dataString: string): VerifiedDepositEvent {
    const data = JSON.parse(dataString);
    const depositEvent: VerifiedDepositEvent = {
      ...data,
      depositDataRoot: new Uint8Array(data.depositDataRoot),
    };
    return depositEvent;
  }

  /**
   * Serializes a VerifiedDepositEvent into a JSON string, converting `depositDataRoot` from Uint8Array to an array.
   *
   * @param {VerifiedDepositEvent} depositEvent - The deposit event to serialize.
   * @returns {string} The serialized JSON string of the deposit event.
   * @public
   */
  public serializeDepositEvent(depositEvent: VerifiedDepositEvent) {
    const { depositDataRoot, ...rest } = depositEvent;
    const value = {
      ...rest,
      depositDataRoot: Array.from(depositDataRoot),
    };
    return JSON.stringify(value);
  }

  /**
   * Inserts a batch of deposit events and a header into the database.
   *
   * @param {VerifiedDepositEvent[]} events - An array of verified deposit events to be inserted into the database.
   * @param {VerifiedDepositEventsCacheHeaders} header - The header information to be stored along with the events.
   * @returns {Promise<void>} A promise that resolves when all operations have been successfully committed to the database.
   * @public
   */
  public async insertEventsCacheBatch(records: {
    data: VerifiedDepositEvent[];
    headers: VerifiedDepositEventsCacheHeaders;
  }) {
    const ops = records.data.map((event) => ({
      type: 'put' as const,
      key: this.generateDepositKey(event.depositCount),
      value: this.serializeDepositEvent(event),
    }));
    ops.push({
      type: 'put',
      key: 'headers',
      value: JSON.stringify(records.headers),
    });
    await this.db.batch(ops);
  }

  /**
   * Inserts a batch of deposit events and a header into the database.
   *
   * @param {VerifiedDepositEvent} event - Last valid and verified event.
   * @returns {Promise<void>} A promise that resolves when all operations have been successfully committed to the database.
   * @public
   */
  public async insertLastValidEvent(event: VerifiedDepositEvent) {
    await this.db.put('last-valid-event', this.serializeDepositEvent(event));
  }

  /**
   * Clears all entries from the database.
   *
   * @returns {Promise<void>}
   * @public
   */
  public async deleteCache(): Promise<void> {
    await this.db.clear();
  }

  /**
   * Close the database connection.
   *
   * @returns {Promise<void>}
   * @public
   */
  public async close(): Promise<void> {
    await this.db.close();
  }

  /**
   * Saves deposited events to cache
   */
  public async setCachedEvents(
    cachedEvents: VerifiedDepositEventsCache,
  ): Promise<void> {
    await this.deleteCache();
    await this.insertEventsCacheBatch({
      ...cachedEvents,
      headers: {
        ...cachedEvents.headers,
      },
    });
  }
}
