import { Test } from '@nestjs/testing';
import { randomBytes } from 'crypto';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigModule } from './config.module';
import { Configuration } from './configuration';

describe('ConfigModule', () => {
  const originalEnv = process.env;
  const dir = mkdtempSync(join(tmpdir(), 'council-config-'));
  const rpcUrlFile = join(dir, 'rpc-url');
  const emptyFile = join(dir, 'empty');
  const keyedRpcUrlFile = join(dir, 'keyed-rpc-url');
  // A capital letter makes the key look random to the masking rules.
  const rpcKey = `K${randomBytes(16).toString('hex')}`;
  writeFileSync(rpcUrlFile, 'https://eth.example.com\n');
  writeFileSync(emptyFile, '\n');
  writeFileSync(keyedRpcUrlFile, `https://eth.example.com/v2/${rpcKey}\n`);

  const ENV = {
    PATH: originalEnv.PATH,
    NODE_ENV: 'production',
    CHAIN_ID: '1',
    KEYS_API_URL: 'http://keys-api.example.com',
    EVM_CHAIN_DATA_BUS_ADDRESS: '0x0000000000000000000000000000000000000001',
    EVM_CHAIN_DATA_BUS_PROVIDER_URL: 'https://data-bus.example.com',
    EVM_CHAIN_DATA_BUS_CHAIN_ID: '100',
  };

  let stderr: string[];
  let stdout: string[];
  let exit: jest.SpyInstance;

  const load = () =>
    Test.createTestingModule({ imports: [ConfigModule.forRoot()] })
      .compile()
      .then((moduleRef) => moduleRef.get<Configuration>(Configuration));

  /** The records with the given message, from both streams. */
  const records = (message: string) =>
    [...stdout, ...stderr]
      .flatMap((chunk) => chunk.split('\n'))
      .filter((line) => line.startsWith('{'))
      .map((line) => JSON.parse(line))
      .filter((record) => record.message === message);

  /**
   * Collects one output stream. The winston console transport writes to the
   * stream, or to `console.log` and `console.error` when the console has no
   * stream of its own, as under jest.
   */
  const capture = (stream: 'stdout' | 'stderr', method: 'log' | 'error') => {
    const lines: string[] = [];
    const push = (...args: unknown[]) => {
      lines.push(String(args[0]));
      return true;
    };
    jest.spyOn(process[stream], 'write').mockImplementation(push);
    jest.spyOn(console, method).mockImplementation(push);
    const consoleStream = (console as any)[`_${stream}`];
    if (consoleStream && consoleStream !== process[stream]) {
      jest.spyOn(consoleStream, 'write').mockImplementation(push);
    }
    return lines;
  };

  beforeEach(() => {
    stdout = capture('stdout', 'log');
    stderr = capture('stderr', 'error');
    exit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit');
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('loads a required value that comes only from a file', async () => {
    process.env = { ...ENV, RPC_URL_FILE: rpcUrlFile };

    const config = await load();

    expect(config.RPC_URL).toBe('https://eth.example.com');
    expect(exit).not.toHaveBeenCalled();
  });

  it('logs a validation error as JSON and exits with 1', async () => {
    process.env = { ...ENV };

    await expect(load()).rejects.toThrow('process.exit');

    expect(exit).toHaveBeenCalledWith(1);
    const records = stderr.map((line) => JSON.parse(line));
    expect(records).toContainEqual(
      expect.objectContaining({
        level: 'error',
        message: 'Bad environment variable',
        error: expect.objectContaining({ property: 'RPC_URL' }),
      }),
    );
  });

  it('logs an empty secret file as JSON and exits with 1', async () => {
    process.env = { ...ENV, RPC_URL_FILE: emptyFile };

    await expect(load()).rejects.toThrow('process.exit');

    expect(exit).toHaveBeenCalledWith(1);
    expect(stderr.join('')).toContain('RPC_URL_FILE points to an empty file');
    expect(JSON.parse(stderr[0])).toMatchObject({
      level: 'error',
      message: 'Cannot load the config',
    });
  });

  it('writes the masked config dump as soon as the config loads', async () => {
    process.env = { ...ENV, RPC_URL_FILE: keyedRpcUrlFile };

    await load();

    const [dump] = records('Config');
    expect(dump).toMatchObject({ level: 'info', context: { CHAIN_ID: 1 } });
    expect(dump.context).toHaveProperty('RPC_URL');
    expect(dump.context).not.toHaveProperty('PATH');
    expect([...stdout, ...stderr].join('')).not.toContain(rpcKey);
  });

  it('writes the dump before a provider that needs the config fails', async () => {
    process.env = { ...ENV, RPC_URL_FILE: keyedRpcUrlFile };

    await expect(
      Test.createTestingModule({
        imports: [ConfigModule.forRoot()],
        providers: [
          {
            provide: 'RPC_PROVIDER',
            useFactory: () => {
              throw new Error('RPC is down');
            },
            inject: [Configuration],
          },
        ],
      }).compile(),
    ).rejects.toThrow('RPC is down');

    expect(records('Config')).toHaveLength(1);
  });

  it('loads .env without writing to the console', () => {
    jest.isolateModules(() => {
      jest.requireActual('./config.module');
    });

    expect([...stdout, ...stderr].join('')).not.toContain('injected env');
  });
});
