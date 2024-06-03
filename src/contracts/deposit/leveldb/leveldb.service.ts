import { Inject, Injectable } from '@nestjs/common';
import { Level } from 'level';
import { join } from 'path';
import {
  DB_DIR,
  DB_DEFAULT_VALUE,
  MAX_DEPOSIT_COUNT,
  DB_LAYER_DIR,
} from './leveldb.constants';
import { ProviderService } from 'provider';
import { VerifiedDepositEvent, VerifiedDepositEventsCacheHeaders } from '..';

@Injectable()
export class LevelDBService {
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

      return { data, headers };
    } catch (error: any) {
      if (error.code === 'LEVEL_NOT_FOUND') return this.cacheDefaultValue;
      throw error;
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
}
