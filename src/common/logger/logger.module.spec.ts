import { randomBytes } from 'crypto';
import { Writable } from 'stream';
import { LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { plainToClass } from 'class-transformer';
import { validate } from 'class-validator';
import { Wallet } from 'ethers';
import {
  WINSTON_MODULE_NEST_PROVIDER,
  WINSTON_MODULE_PROVIDER,
} from 'nest-winston';
import * as winston from 'winston';
import {
  ConfigModule,
  Configuration,
  createConfigErrorLogger,
  dumpConfig,
} from 'common/config';
import { InMemoryConfiguration } from 'common/config/in-memory-configuration';
import { KeysApiService } from 'keys-api/keys-api.service';
import { LoggerModule } from './logger.module';

/** Keeps the final JSON line of every record. */
const captureTransport = () => {
  const lines: string[] = [];
  const transport = new winston.transports.Stream({
    format: winston.format.json(),
    stream: new Writable({
      write(chunk, _encoding, callback) {
        lines.push(chunk.toString().trim());
        callback();
      },
    }),
  });
  return { lines, transport };
};

// A capital letter makes the key look random to the masking rules.
const rpcKey = `K${randomBytes(16).toString('hex')}`;
const rpcUrl = `https://eth.example.com/v2/${rpcKey}`;
const keysApiUrl = 'http://keys-api.internal:3000';
// A provider whose key is the first part of the host name.
const hostKey = `h${randomBytes(8).toString('hex')}`;
const dataBusUrl = `http://${hostKey}-rpc.nodes.example.com`;
const walletKey = Wallet.createRandom().privateKey;

const ENV = {
  CHAIN_ID: '1',
  LOG_FORMAT: 'json',
  LOG_LEVEL: 'debug',
  RPC_URL: rpcUrl,
  KEYS_API_URL: keysApiUrl,
  WALLET_PRIVATE_KEY: walletKey,
  EVM_CHAIN_DATA_BUS_ADDRESS: 'DATA_BUS_ADDRESS',
  EVM_CHAIN_DATA_BUS_PROVIDER_URL: dataBusUrl,
  EVM_CHAIN_DATA_BUS_CHAIN_ID: '100',
};

const createLogger = async (config: object) => {
  const moduleRef = await Test.createTestingModule({
    imports: [ConfigModule.forRoot(), LoggerModule],
  })
    .overrideProvider(Configuration)
    .useValue(config)
    .compile();

  const capture = captureTransport();
  moduleRef
    .get<winston.Logger>(WINSTON_MODULE_PROVIDER)
    .clear()
    .add(capture.transport);

  return {
    logger: moduleRef.get<LoggerService>(WINSTON_MODULE_NEST_PROVIDER),
    capture,
  };
};

const expectNoSecrets = (lines: string[]) => {
  const text = lines.join('\n');
  expect(text).not.toContain(rpcKey);
  expect(text).not.toContain('keys-api.internal');
  expect(text).not.toContain(walletKey.slice(2).toLowerCase());
  expect(text).not.toContain(hostKey);
};

/** Cuts the text inside the secret, as a library does before logging. */
const cutInside = (text: string, secret: string, keep: number) =>
  text.slice(0, text.indexOf(secret) + keep) + '...[truncated]';

describe('LoggerModule secret masking', () => {
  const config = plainToClass(InMemoryConfiguration, ENV);

  it('masks an RPC key in an error record and writes JSON', async () => {
    const { logger, capture } = await createLogger(config);

    logger.error('Uncaught exception');
    logger.error(new Error(`request to ${rpcUrl} failed`));

    expectNoSecrets(capture.lines);
    const records = capture.lines.map((line) => JSON.parse(line));
    expect(records.map((record) => record.level)).toEqual(['error', 'error']);
    expect(capture.lines.join('\n')).toContain('eth.example.com');
  });

  it.each([
    ['an RPC path key', () => rpcUrl, () => rpcKey],
    ['a host name key', () => dataBusUrl, () => hostKey],
  ])('masks %s cut by a library before logging', async (_name, url, key) => {
    const { logger, capture } = await createLogger(config);
    const error = `missing response (requestBody="${'x'.repeat(900)}", url="${url()}")`;

    for (let keep = 8; keep < key().length; keep++) {
      logger.error(cutInside(error, key(), keep));
    }

    const text = capture.lines.join('\n');
    expect(capture.lines).toHaveLength(key().length - 8);
    expect(text).not.toContain(key().slice(0, 8));
  });

  it('masks an RPC key cut at the masking length limit', async () => {
    const { logger, capture } = await createLogger(config);
    // The masking walk cuts strings at 10 000 characters before matching.
    const padding = 'y'.repeat(10_000 - 'url='.length - rpcUrl.length + 20);

    logger.error(`${padding}url=${rpcUrl}`);

    expect(capture.lines.join('\n')).not.toContain(rpcKey.slice(0, 8));
  });

  it('masks secrets in an unhandled rejection reason', async () => {
    const { logger, capture } = await createLogger(config);

    logger.log('Unhandled rejection');
    logger.error({ reason: 'timeout', url: rpcUrl, key: walletKey });

    expect(capture.lines).toHaveLength(2);
    expectNoSecrets(capture.lines);
  });

  it('masks the Keys API URL in a Keys API error', async () => {
    const { logger, capture } = await createLogger(config);
    const fetchJson = jest
      .fn()
      .mockRejectedValue(new Error(`connect to ${keysApiUrl} failed`));
    const keysApi = new KeysApiService(logger, config, { fetchJson } as any);

    await expect(keysApi.getKeysApiStatus()).rejects.toThrow();

    expect(capture.lines.join('\n')).toContain('Keys API request error');
    expectNoSecrets(capture.lines);
  });

  it('masks secrets in config validation errors', async () => {
    const invalid = plainToClass(InMemoryConfiguration, {
      ...ENV,
      LOG_LEVEL: 'warning',
    });
    const errors = await validate(invalid, {
      validationError: { target: false, value: false },
    });
    const logger = createConfigErrorLogger(invalid);
    const capture = captureTransport();
    logger.clear().add(capture.transport);

    errors.forEach((error) =>
      logger.error('Bad environment variable', {
        context: 'ConfigModule',
        error,
      }),
    );
    logger.error(`check ${rpcUrl}`);

    expect(errors.map((error) => error.property)).toEqual(['LOG_LEVEL']);
    expect(JSON.parse(capture.lines[0]).error.property).toBe('LOG_LEVEL');
    expectNoSecrets(capture.lines);
  });

  it.each([
    ['error', 'error'],
    ['warn', 'warn'],
    ['info', 'log'],
    ['debug', 'debug'],
  ] as const)('writes records at LOG_LEVEL=%s', async (level, method) => {
    const { logger, capture } = await createLogger({
      ...config,
      LOG_LEVEL: level,
    });

    logger[method]?.(`a ${level} record`);

    expect(capture.lines).toHaveLength(1);
    expect(JSON.parse(capture.lines[0]).level).toBe(level);
  });

  it('dumps every config field with secrets masked', async () => {
    const withEnv = plainToClass(InMemoryConfiguration, {
      ...ENV,
      PATH: '/usr/bin',
    });
    const dump = dumpConfig(withEnv);
    const { logger, capture } = await createLogger(withEnv);

    logger.log('Config', dump);

    expect(Object.keys(dump)).toEqual(
      expect.arrayContaining([
        'CHAIN_ID',
        'PROVIDERS_URLS',
        'RPC_URL',
        'RPC_URL_FILE',
        'WALLET_PRIVATE_KEY',
        'WALLET_MIN_BALANCE',
        'EVM_CHAIN_DATA_BUS_CHAIN_ID',
      ]),
    );
    expect(Object.keys(dump)).not.toContain('PATH');
    expect(dump.WALLET_MIN_BALANCE).toBe(withEnv.WALLET_MIN_BALANCE.toString());
    expectNoSecrets(capture.lines);
    expect(JSON.parse(capture.lines[0]).context.CHAIN_ID).toBe(1);
  });
});
