import { Inject, Injectable } from '@nestjs/common';
import { Level } from 'level';
import { join } from 'path';
import { DB_DIR, DB_DEFAULT_VALUE, DB_LAYER_DIR } from './store.constants';
import { ProviderService } from 'provider';
import { SigningKeyEvent } from '../interfaces/event.interface';
import { SigningKeyEventsCacheHeaders } from '../interfaces/cache.interface';

@Injectable()
export class SigningKeysStoreService {
  private db!: Level<string, string>;
  constructor(
    private providerService: ProviderService,
    @Inject(DB_DIR) private cacheDir: string,
    @Inject(DB_LAYER_DIR) private cacheLayerDir: string,
    @Inject(DB_DEFAULT_VALUE)
    private cacheDefaultValue: {
      data: SigningKeyEvent[];
      headers: SigningKeyEventsCacheHeaders;
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
   * Asynchronously retrieves signing key events and headers from the database.
   * Iterates through entries starting with 'signingKey:' to collect data and fetches headers stored under 'header'.
   * Handles errors by logging and returning default cache values.
   *
   * @returns {Promise<{data: SigningKeyEvent[], headers: SigningKeyEventsCacheHeaders}>} Cache data and headers.
   * @public
   */
  public async getEventsCache(): Promise<{
    data: SigningKeyEvent[];
    headers: SigningKeyEventsCacheHeaders;
  }> {
    try {
      const stream = this.db.iterator({
        gte: 'signingKey:',
        lte: 'signingKey:\xFF',
      });

      const data: SigningKeyEvent[] = [];

      for await (const [, value] of stream) {
        data.push(this.parseSigningKeyEvent(value));
      }
      const headers: SigningKeyEventsCacheHeaders = JSON.parse(
        await this.db.get('headers'),
      );

      return { data, headers };
    } catch (error: any) {
      if (error.code === 'LEVEL_NOT_FOUND') return this.cacheDefaultValue;
      throw error;
    }
  }

  /**
   * @param {string[]} keys - public keys list
   * @returns {Promise<{data: SigningKeyEvent[], headers: SigningKeyEventsCacheHeaders}>} Cache data and headers.
   * @public
   */
  public async getCachedEvents(keys: string[]): Promise<{
    data: SigningKeyEvent[];
    headers: SigningKeyEventsCacheHeaders;
  }> {
    try {
      const data: SigningKeyEvent[] = [];
      for (const key of keys) {
        const stream = this.db.iterator({
          gte: `signingKey:${key}`,
          lte: `signingKey:${key}\xFF`,
        });

        for await (const [, value] of stream) {
          data.push(this.parseSigningKeyEvent(value));
        }
      }

      const headers: SigningKeyEventsCacheHeaders = JSON.parse(
        await this.db.get('headers'),
      );

      return {
        data,
        headers,
      };
    } catch (error: any) {
      if (error.code === 'LEVEL_NOT_FOUND') return this.cacheDefaultValue;
      throw error;
    }
  }

  /** Get header
   * @returns {Promise<{ headers: SigningKeyEventsCacheHeaders}>} Cache  headers.
   * @public
   */
  public async getHeader(): Promise<{
    headers: SigningKeyEventsCacheHeaders;
  }> {
    try {
      const headers: SigningKeyEventsCacheHeaders = JSON.parse(
        await this.db.get('headers'),
      );

      return {
        headers,
      };
    } catch (error: any) {
      if (error.code === 'LEVEL_NOT_FOUND') return this.cacheDefaultValue;
      throw error;
    }
  }

  /**
   * Generates a signing key event key for storage.
   */
  private generateSigningKeyEventStorageKey({
    key,
    blockNumber,
    logIndex,
  }: SigningKeyEvent): string {
    return `signingKey:${key}:${blockNumber}:${logIndex}`;
  }

  /**
   * Parses a JSON string to a SigningKeyEvent.
   *
   * @param {string} dataString - The JSON string representing a signing key event.
   * @returns {SigningKeyEvent} The parsed signing key event.
   * @private
   */
  private parseSigningKeyEvent(dataString: string): SigningKeyEvent {
    return JSON.parse(dataString);
  }

  /**
   * Serializes a SigningKeyEvent into a JSON string.
   *
   * @param {SigningKeyEvent} signingKeyEvent - The signing key event to serialize.
   * @returns {string} The serialized JSON string of the signing key event.
   * @public
   */
  public serializeEventData(signingKeyEvent: SigningKeyEvent) {
    return JSON.stringify(signingKeyEvent);
  }

  /**
   * Inserts a batch of signing key events and a header into the database.
   *
   * @param {SigningKeyEvent[]} events - An array of signing key events to be inserted into the database.
   * @param {SigningKeyEventsCacheHeaders} header - The header information to be stored along with the events.
   * @returns {Promise<void>} A promise that resolves when all operations have been successfully committed to the database.
   * @public
   */
  public async insertEventsCacheBatch(records: {
    data: SigningKeyEvent[];
    headers: SigningKeyEventsCacheHeaders;
  }) {
    if (!this.validateHeader(records.headers)) {
      throw new Error(
        'Invalid headers: Headers must contain exactly all SigningKeyEventsCacheHeaders keys.',
      );
    }

    const ops = records.data.map((event) => ({
      type: 'put' as const,
      key: this.generateSigningKeyEventStorageKey(event),
      value: this.serializeEventData(event),
    }));
    ops.push({
      type: 'put',
      key: 'headers',
      value: JSON.stringify(records.headers),
    });
    await this.db.batch(ops);
  }

  private validateHeader(
    headers: any,
  ): headers is SigningKeyEventsCacheHeaders {
    const requiredHeaders: (keyof SigningKeyEventsCacheHeaders)[] = [
      'stakingModulesAddresses',
      'startBlock',
      'endBlock',
    ];

    const headersKeys = Object.keys(
      headers,
    ) as (keyof SigningKeyEventsCacheHeaders)[];
    const hasNoExtraKey = headersKeys.every((key) =>
      requiredHeaders.includes(key),
    );
    const hasAllRequiredKeys = requiredHeaders.every((key) =>
      headersKeys.includes(key),
    );

    return hasNoExtraKey && hasAllRequiredKeys;
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
