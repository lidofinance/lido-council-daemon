import { Test } from '@nestjs/testing';
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
  writeFileSync(rpcUrlFile, 'https://eth.example.com\n');
  writeFileSync(emptyFile, '\n');

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
  let exit: jest.SpyInstance;

  const load = () =>
    Test.createTestingModule({ imports: [ConfigModule.forRoot()] })
      .compile()
      .then((moduleRef) => moduleRef.get<Configuration>(Configuration));

  beforeEach(() => {
    stderr = [];
    // The winston console transport writes to stderr, or to console.error
    // when the console has no stderr stream, as under jest.
    jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr.push(chunk.toString());
      return true;
    });
    jest
      .spyOn(console, 'error')
      .mockImplementation((line) => stderr.push(String(line)));
    const consoleStderr = (console as any)._stderr;
    if (consoleStderr && consoleStderr !== process.stderr) {
      jest.spyOn(consoleStderr, 'write').mockImplementation((chunk: any) => {
        stderr.push(chunk.toString());
        return true;
      });
    }
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
});
