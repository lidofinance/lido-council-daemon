import { BigNumber } from '@ethersproject/bignumber';
import { Test } from '@nestjs/testing';
import { plainToClass } from 'class-transformer';
import { validateOrReject, ValidationError } from 'class-validator';
import { ConfigLoaderService } from './config-loader.service';
import { InMemoryConfiguration } from './in-memory-configuration';

const FAKE_FS = {
  rabbit: 'rabbit',
  wallet: 'wallet',
};

const DEFAULTS = {
  RPC_URL: 'some-rpc-url',
  RABBITMQ_URL: 'some-rabbit-url',
  RABBITMQ_LOGIN: 'some-rabbit-login',
  KEYS_API_URL: 'keys-api',
  EVM_CHAIN_DATA_BUS_ADDRESS: 'DATA_BUS_ADDRESS',
  EVM_CHAIN_DATA_BUS_PROVIDER_URL: 'DATA_BUS_PROVIDER_URL',
};

const extractError = async <T>(
  fn: Promise<T>,
): Promise<[ValidationError[], T]> => {
  try {
    return [[], await fn];
  } catch (error: any) {
    return [error as ValidationError[], undefined as unknown as T];
  }
};

const toHaveProblemWithRecords = (
  recordsKeys: string[],
  errors: ValidationError[],
) => {
  const errorKeys = errors.map((error) => error.property);
  expect(recordsKeys.sort()).toEqual(errorKeys.sort());
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

  describe('kapi url config', () => {
    test('all invariants are empty', async () => {
      const prepConfig = plainToClass(InMemoryConfiguration, {
        RABBITMQ_PASSCODE: 'some-rabbit-passcode',
        ...DEFAULTS,
        KEYS_API_URL: undefined,
      });
      const [validationErrors] = await extractError(
        configLoaderService.loadSecrets(prepConfig),
      );

      toHaveProblemWithRecords(
        ['KEYS_API_URL', 'KEYS_API_PORT', 'KEYS_API_HOST'],
        validationErrors,
      );
    });

    test('KEYS_API_URL is set and the rest is default', async () => {
      const KEYS_API_URL = 'kapi-url';
      const KEYS_API_HOST = '';
      const KEYS_API_PORT = 0;
      const prepConfig = plainToClass(InMemoryConfiguration, {
        RABBITMQ_PASSCODE: 'some-rabbit-passcode',
        ...DEFAULTS,
        KEYS_API_URL,
      });
      const [validationErrors, result] = await extractError(
        configLoaderService.loadSecrets(prepConfig),
      );
      expect(validationErrors).toHaveLength(0);
      expect(result.KEYS_API_URL).toBe(KEYS_API_URL);
      expect(result.KEYS_API_HOST).toBe(KEYS_API_HOST);
      expect(result.KEYS_API_PORT).toBe(KEYS_API_PORT);
    });

    test('KEYS_API_URL is empty and the rest is set', async () => {
      const KEYS_API_URL = undefined;
      const KEYS_API_HOST = 'kapi-host';
      const KEYS_API_PORT = 2222;
      const prepConfig = plainToClass(InMemoryConfiguration, {
        RABBITMQ_PASSCODE: 'some-rabbit-passcode',
        ...DEFAULTS,
        KEYS_API_URL,
        KEYS_API_HOST,
        KEYS_API_PORT,
      });
      const [validationErrors, result] = await extractError(
        configLoaderService.loadSecrets(prepConfig),
      );
      expect(validationErrors).toHaveLength(0);
      expect(result.KEYS_API_URL).toBe(KEYS_API_URL);
      expect(result.KEYS_API_HOST).toBe(KEYS_API_HOST);
      expect(result.KEYS_API_PORT).toBe(KEYS_API_PORT);
    });

    test('KEYS_API_URL and KEYS_API_PORT are empty and the KEYS_API_HOST is set', async () => {
      const KEYS_API_URL = undefined;
      const KEYS_API_HOST = 'kapi-host';
      const KEYS_API_PORT = 0;
      const prepConfig = plainToClass(InMemoryConfiguration, {
        RABBITMQ_PASSCODE: 'some-rabbit-passcode',
        ...DEFAULTS,
        KEYS_API_URL,
        KEYS_API_HOST,
        KEYS_API_PORT,
      });
      const [validationErrors] = await extractError(
        configLoaderService.loadSecrets(prepConfig),
      );
      toHaveProblemWithRecords(['KEYS_API_PORT'], validationErrors);
    });

    test('KEYS_API_URL and KEYS_API_HOST are empty and the KEYS_API_PORT is set', async () => {
      const KEYS_API_URL = undefined;
      const KEYS_API_HOST = '';
      const KEYS_API_PORT = 2222;
      const prepConfig = plainToClass(InMemoryConfiguration, {
        RABBITMQ_PASSCODE: 'some-rabbit-passcode',
        ...DEFAULTS,
        KEYS_API_URL,
        KEYS_API_HOST,
        KEYS_API_PORT,
      });
      const [validationErrors] = await extractError(
        configLoaderService.loadSecrets(prepConfig),
      );
      toHaveProblemWithRecords(['KEYS_API_HOST'], validationErrors);
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
    const DEFAULTS_WITH_RABBIT = {
      ...DEFAULTS,
      RABBITMQ_PASSCODE: 'some-rabbit-passcode',
    };

    test('should throw an error for an excessively small WALLET_CRITICAL_BALANCE', async () => {
      const WALLET_CRITICAL_BALANCE = '0.0000000000000000001';
      const plainConfig = plainToClass(InMemoryConfiguration, {
        WALLET_CRITICAL_BALANCE,
        ...DEFAULTS_WITH_RABBIT,
      });

      expect(plainConfig).toHaveProperty('WALLET_CRITICAL_BALANCE');
      expect(plainConfig.WALLET_CRITICAL_BALANCE).toBeNaN();

      await validateOrReject(plainConfig, {
        validationError: { target: false, value: false },
      }).catch((errors) => {
        expect(errors).toBeInstanceOf(Array);
        expect(errors.length).toBe(1);
        expect(errors[0]).toBeInstanceOf(ValidationError);
        expect(errors[0].property).toBe('WALLET_CRITICAL_BALANCE');
        expect(errors[0].constraints).toHaveProperty(
          'isInstance',
          'WALLET_CRITICAL_BALANCE must be an instance of BigNumber',
        );
      });
    });

    test('should throw an error for an empty WALLET_CRITICAL_BALANCE', async () => {
      const WALLET_CRITICAL_BALANCE = '';
      const plainConfig = plainToClass(InMemoryConfiguration, {
        WALLET_CRITICAL_BALANCE,
        ...DEFAULTS_WITH_RABBIT,
      });

      expect(plainConfig).toHaveProperty('WALLET_CRITICAL_BALANCE');
      expect(plainConfig.WALLET_CRITICAL_BALANCE).toBeNaN();

      await validateOrReject(plainConfig, {
        validationError: { target: false, value: false },
      }).catch((errors) => {
        expect(errors).toBeInstanceOf(Array);
        expect(errors.length).toBe(1);
        expect(errors[0]).toBeInstanceOf(ValidationError);
        expect(errors[0].property).toBe('WALLET_CRITICAL_BALANCE');
        expect(errors[0].constraints).toHaveProperty(
          'isInstance',
          'WALLET_CRITICAL_BALANCE must be an instance of BigNumber',
        );
      });
    });

    test('should handle normal WALLET_CRITICAL_BALANCE values correctly', async () => {
      const plainConfig = plainToClass(InMemoryConfiguration, {
        WALLET_CRITICAL_BALANCE: '0.2',
        ...DEFAULTS_WITH_RABBIT,
      });

      await validateOrReject(plainConfig, {
        validationError: { target: false, value: false },
      }).then(() => {
        expect(plainConfig).toHaveProperty('WALLET_CRITICAL_BALANCE');
        expect(plainConfig.WALLET_CRITICAL_BALANCE).toBeInstanceOf(BigNumber);
        expect(plainConfig.WALLET_CRITICAL_BALANCE.toString()).toBe(
          '200000000000000000',
        );
      });
    });

    test('should use default WALLET_CRITICAL_BALANCE value', async () => {
      const plainConfig = plainToClass(InMemoryConfiguration, {
        ...DEFAULTS_WITH_RABBIT,
      });

      await validateOrReject(plainConfig, {
        validationError: { target: false, value: false },
      }).then(() => {
        expect(plainConfig).toHaveProperty('WALLET_CRITICAL_BALANCE');
        expect(plainConfig.WALLET_CRITICAL_BALANCE).toBeInstanceOf(BigNumber);
        expect(plainConfig.WALLET_CRITICAL_BALANCE.toString()).toBe(
          '200000000000000000',
        );
      });
    });

    test('should throw an error for an excessively small WALLET_MIN_BALANCE', async () => {
      const WALLET_MIN_BALANCE = '0.0000000000000000001';
      const plainConfig = plainToClass(InMemoryConfiguration, {
        WALLET_MIN_BALANCE,
        ...DEFAULTS_WITH_RABBIT,
      });

      expect(plainConfig).toHaveProperty('WALLET_MIN_BALANCE');
      expect(plainConfig.WALLET_MIN_BALANCE).toBeNaN();

      await validateOrReject(plainConfig, {
        validationError: { target: false, value: false },
      }).catch((errors) => {
        expect(errors).toBeInstanceOf(Array);
        expect(errors.length).toBe(1);
        expect(errors[0]).toBeInstanceOf(ValidationError);
        expect(errors[0].property).toBe('WALLET_MIN_BALANCE');
        expect(errors[0].constraints).toHaveProperty(
          'isInstance',
          'WALLET_MIN_BALANCE must be an instance of BigNumber',
        );
      });
    });

    test('should throw an error for an empty WALLET_MIN_BALANCE', async () => {
      const WALLET_MIN_BALANCE = '';
      const plainConfig = plainToClass(InMemoryConfiguration, {
        WALLET_MIN_BALANCE,
        ...DEFAULTS_WITH_RABBIT,
      });

      expect(plainConfig).toHaveProperty('WALLET_MIN_BALANCE');
      expect(plainConfig.WALLET_MIN_BALANCE).toBeNaN();

      await validateOrReject(plainConfig, {
        validationError: { target: false, value: false },
      }).catch((errors) => {
        expect(errors).toBeInstanceOf(Array);
        expect(errors.length).toBe(1);
        expect(errors[0]).toBeInstanceOf(ValidationError);
        expect(errors[0].property).toBe('WALLET_MIN_BALANCE');
        expect(errors[0].constraints).toHaveProperty(
          'isInstance',
          'WALLET_MIN_BALANCE must be an instance of BigNumber',
        );
      });
    });

    test('should handle normal WALLET_MIN_BALANCE values correctly', async () => {
      const plainConfig = plainToClass(InMemoryConfiguration, {
        WALLET_MIN_BALANCE: '0.2',
        ...DEFAULTS_WITH_RABBIT,
      });

      await validateOrReject(plainConfig, {
        validationError: { target: false, value: false },
      }).then(() => {
        expect(plainConfig).toHaveProperty('WALLET_MIN_BALANCE');
        expect(plainConfig.WALLET_MIN_BALANCE).toBeInstanceOf(BigNumber);
        expect(plainConfig.WALLET_MIN_BALANCE.toString()).toBe(
          '200000000000000000',
        );
      });
    });

    test('should use default WALLET_MIN_BALANCE value', async () => {
      const plainConfig = plainToClass(InMemoryConfiguration, {
        ...DEFAULTS_WITH_RABBIT,
      });

      await validateOrReject(plainConfig, {
        validationError: { target: false, value: false },
      }).then(() => {
        expect(plainConfig).toHaveProperty('WALLET_MIN_BALANCE');
        expect(plainConfig.WALLET_MIN_BALANCE).toBeInstanceOf(BigNumber);
        expect(plainConfig.WALLET_MIN_BALANCE.toString()).toBe(
          '500000000000000000',
        );
      });
    });
  });
});
