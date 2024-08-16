import { Test } from '@nestjs/testing';
import { plainToClass } from 'class-transformer';
import { ConfigLoaderService } from './config-loader.service';
import { BadConfigException } from './exceptions';
import { InMemoryConfiguration } from './in-memory-configuration';

const FAKE_FS = {
  rabbit: 'rabbit',
  wallet: 'wallet',
};

const DEFAULTS = {
  RPC_URL: 'some-rpc-url',
  RABBITMQ_URL: 'some-rabbit-url',
  RABBITMQ_LOGIN: 'some-rabbit-login',
};

describe('ConfigLoaderService base spec', () => {
  let configLoaderService: ConfigLoaderService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigLoaderService],
    }).compile();

    configLoaderService = moduleRef.get(ConfigLoaderService);

    const cb = (path: string) => {
      if (FAKE_FS[path]) return FAKE_FS[path];

      throw new Error('unknown path');
    };
    jest.spyOn(configLoaderService, 'readFile').mockImplementation(cb);
  });

  test('default behavior', async () => {
    const prepConfig = plainToClass(InMemoryConfiguration, {
      RABBITMQ_PASSCODE: 'some-rabbit-passcode',
      ...DEFAULTS,
    });

    await expect(() =>
      configLoaderService.loadSecrets(prepConfig),
    ).not.toThrowError();
  });

  describe('rabbit mq', () => {
    let configLoaderService: ConfigLoaderService;

    beforeEach(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [ConfigLoaderService],
      }).compile();

      configLoaderService = moduleRef.get(ConfigLoaderService);

      const cb = (path: string) => {
        if (FAKE_FS[path]) return FAKE_FS[path];

        throw new Error('unknown path');
      };
      jest.spyOn(configLoaderService, 'readFile').mockImplementation(cb);
    });

    test('passcode in file negative', async () => {
      const prepConfig = plainToClass(InMemoryConfiguration, {
        RABBITMQ_PASSCODE_FILE: 'unreal path',
        ...DEFAULTS,
      });

      await expect(() =>
        configLoaderService.loadSecrets(prepConfig),
      ).rejects.toThrow('unknown path');
    });

    test('passcode in env positive', async () => {
      const prepConfig = plainToClass(InMemoryConfiguration, {
        RABBITMQ_PASSCODE: 'env-rabbit',
        ...DEFAULTS,
      });
      const config = await configLoaderService.loadSecrets(prepConfig);

      expect(config).toHaveProperty('RABBITMQ_PASSCODE', 'env-rabbit');
    });

    test('passcode in file positive', async () => {
      const prepConfig = plainToClass(InMemoryConfiguration, {
        RABBITMQ_PASSCODE_FILE: 'rabbit',
        ...DEFAULTS,
      });
      const config = await configLoaderService.loadSecrets(prepConfig);

      expect(config).toHaveProperty('RABBITMQ_PASSCODE', 'rabbit');
    });

    test('passcode in file order _FILE', async () => {
      const prepConfig = plainToClass(InMemoryConfiguration, {
        RABBITMQ_PASSCODE_FILE: 'rabbit',
        RABBITMQ_PASSCODE: 'some-rabbit-passcode',
        ...DEFAULTS,
      });

      const config = await configLoaderService.loadSecrets(prepConfig);
      expect(config).toHaveProperty('RABBITMQ_PASSCODE', 'rabbit');
    });
  });

  describe('wallet', () => {
    let configLoaderService: ConfigLoaderService;
    const DEFAULTS_WITH_RABBIT = {
      ...DEFAULTS,
      RABBITMQ_PASSCODE: 'some-rabbit-passcode',
    };

    beforeEach(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [ConfigLoaderService],
      }).compile();

      configLoaderService = moduleRef.get(ConfigLoaderService);

      const cb = (path: string) => {
        if (FAKE_FS[path]) return FAKE_FS[path];

        throw new Error('unknown path');
      };
      jest.spyOn(configLoaderService, 'readFile').mockImplementation(cb);
    });

    test('passcode in file negative', async () => {
      const prepConfig = plainToClass(InMemoryConfiguration, {
        WALLET_PRIVATE_KEY_FILE: 'unreal path',
        ...DEFAULTS_WITH_RABBIT,
      });

      await expect(() =>
        configLoaderService.loadSecrets(prepConfig),
      ).rejects.toThrow('unknown path');
    });

    test('passcode in env positive', async () => {
      const prepConfig = plainToClass(InMemoryConfiguration, {
        WALLET_PRIVATE_KEY: 'env-wallet',
        ...DEFAULTS_WITH_RABBIT,
      });
      const config = await configLoaderService.loadSecrets(prepConfig);

      expect(config).toHaveProperty('WALLET_PRIVATE_KEY', 'env-wallet');
    });

    test('passcode in file positive', async () => {
      const prepConfig = plainToClass(InMemoryConfiguration, {
        WALLET_PRIVATE_KEY_FILE: 'wallet',
        ...DEFAULTS_WITH_RABBIT,
      });
      const config = await configLoaderService.loadSecrets(prepConfig);

      expect(config).toHaveProperty('WALLET_PRIVATE_KEY', 'wallet');
    });

    test('passcode in file order _FILE', async () => {
      const prepConfig = plainToClass(InMemoryConfiguration, {
        WALLET_PRIVATE_KEY_FILE: 'wallet',
        WALLET_PRIVATE_KEY: 'some-wallet-passcode',
        ...DEFAULTS_WITH_RABBIT,
      });

      const config = await configLoaderService.loadSecrets(prepConfig);
      expect(config).toHaveProperty('WALLET_PRIVATE_KEY', 'wallet');
    });
  });

  describe('balance', () => {
    let configLoaderService: ConfigLoaderService;
    const DEFAULTS_WITH_RABBIT = {
      ...DEFAULTS,
      RABBITMQ_PASSCODE: 'some-rabbit-passcode',
    };

    beforeEach(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [ConfigLoaderService],
      }).compile();

      configLoaderService = moduleRef.get(ConfigLoaderService);
    });

    test('should throw an error for an excessively small WALLET_CRITICAL_BALANCE', async () => {
      const WALLET_CRITICAL_BALANCE = '0.0000000000000000001';
      try {
        plainToClass(InMemoryConfiguration, {
          WALLET_CRITICAL_BALANCE,
        });

        throw new Error('Expected BadConfigException was not thrown');
      } catch (error) {
        if (error instanceof BadConfigException) {
          expect(error.message).toBe(
            `Invalid WALLET_CRITICAL_BALANCE value: ${WALLET_CRITICAL_BALANCE}. Please ensure it's a valid Ether amount that can be converted to Wei.`,
          );
        } else {
          throw new Error(`Unexpected error type`);
        }
      }
    });

    test('should handle normal WALLET_CRITICAL_BALANCE values correctly', async () => {
      const prepConfig = plainToClass(InMemoryConfiguration, {
        WALLET_CRITICAL_BALANCE: '0.2',
        ...DEFAULTS_WITH_RABBIT,
      });

      const config = await configLoaderService.loadSecrets(prepConfig);

      expect(config).toHaveProperty('WALLET_CRITICAL_BALANCE');
      expect(config.WALLET_CRITICAL_BALANCE.toString()).toBe(
        '200000000000000000',
      ); // Equivalent of 0.2 ETH in Wei
    });

    test('should throw an error for an excessively small WALLET_MIN_BALANCE', async () => {
      const WALLET_MIN_BALANCE = '0.0000000000000000001';
      try {
        plainToClass(InMemoryConfiguration, {
          WALLET_MIN_BALANCE,
        });

        throw new Error('Expected BadConfigException was not thrown');
      } catch (error) {
        if (error instanceof BadConfigException) {
          expect(error.message).toBe(
            `Invalid WALLET_MIN_BALANCE value: ${WALLET_MIN_BALANCE}. Please ensure it's a valid Ether amount that can be converted to Wei.`,
          );
        } else {
          throw new Error(`Unexpected error type`);
        }
      }
    });

    test('should handle normal WALLET_MIN_BALANCE values correctly', async () => {
      const prepConfig = plainToClass(InMemoryConfiguration, {
        WALLET_MIN_BALANCE: '0.2',
        ...DEFAULTS_WITH_RABBIT,
      });

      const config = await configLoaderService.loadSecrets(prepConfig);

      expect(config).toHaveProperty('WALLET_MIN_BALANCE');
      expect(config.WALLET_MIN_BALANCE.toString()).toBe('200000000000000000'); // Equivalent of 0.2 ETH in Wei
    });
  });
});
