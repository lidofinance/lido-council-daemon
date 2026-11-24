import { BigNumber, Wallet } from 'ethers';
import { Test } from '@nestjs/testing';
import { plainToClass } from 'class-transformer';
import { validateOrReject, ValidationError } from 'class-validator';
import { ConfigLoaderService } from './config-loader.service';
import { InMemoryConfiguration } from './in-memory-configuration';
import { parseUrlList, SECRET_ENVS, URL_LIST_ENVS } from './secrets';

const FAKE_FS = {
  wallet: 'wallet',
};

const DEFAULTS = {
  RPC_URL: 'some-rpc-url',
  CHAIN_ID: '1',
  DELEGATION_CONTRACT_ADDRESS: '0x1111111111111111111111111111111111111111',
  KEYS_API_URL: 'keys-api',
  EVM_CHAIN_DATA_BUS_ADDRESS: 'DATA_BUS_ADDRESS',
  EVM_CHAIN_DATA_BUS_PROVIDER_URL: 'DATA_BUS_PROVIDER_URL',
  EVM_CHAIN_DATA_BUS_CHAIN_ID: '100',
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
      providers: [ConfigLoaderService],
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
      ...DEFAULTS,
    });

    await expect(() =>
      configLoaderService.loadSecrets(prepConfig),
    ).not.toThrow();
  });

  describe('kapi url config', () => {
    test('all invariants are empty', async () => {
      const prepConfig = plainToClass(InMemoryConfiguration, {
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

    beforeEach(async () => {
      const moduleRef = await Test.createTestingModule({
        providers: [ConfigLoaderService],
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
        ...DEFAULTS,
      });

      await expect(() =>
        configLoaderService.loadSecrets(prepConfig),
      ).rejects.toThrow('unknown path');
    });

    test('passcode in env positive', async () => {
      const prepConfig = plainToClass(InMemoryConfiguration, {
        WALLET_PRIVATE_KEY: 'env-wallet',
        ...DEFAULTS,
      });
      const config = await configLoaderService.loadSecrets(prepConfig);

      expect(config).toHaveProperty('WALLET_PRIVATE_KEY', 'env-wallet');
    });

    test('passcode in file positive', async () => {
      const prepConfig = plainToClass(InMemoryConfiguration, {
        WALLET_PRIVATE_KEY_FILE: 'wallet',
        ...DEFAULTS,
      });
      const config = await configLoaderService.loadSecrets(prepConfig);

      expect(config).toHaveProperty('WALLET_PRIVATE_KEY', 'wallet');
    });

    test('passcode in file order _FILE', async () => {
      const prepConfig = plainToClass(InMemoryConfiguration, {
        WALLET_PRIVATE_KEY_FILE: 'wallet',
        WALLET_PRIVATE_KEY: 'some-wallet-passcode',
        ...DEFAULTS,
      });

      const config = await configLoaderService.loadSecrets(prepConfig);
      expect(config).toHaveProperty('WALLET_PRIVATE_KEY', 'wallet');
    });
  });

  describe('delegation contract address', () => {
    test('should accept an empty delegation contract address', async () => {
      const config = plainToClass(InMemoryConfiguration, {
        ...DEFAULTS,
        DELEGATION_CONTRACT_ADDRESS: '',
      });

      await expect(
        validateOrReject(config, {
          validationError: { target: false, value: false },
        }),
      ).resolves.toBeUndefined();
    });

    test('should accept a valid delegation contract address', async () => {
      const config = plainToClass(InMemoryConfiguration, {
        ...DEFAULTS,
        DELEGATION_CONTRACT_ADDRESS:
          '0x1111111111111111111111111111111111111111',
      });

      await expect(
        validateOrReject(config, {
          validationError: { target: false, value: false },
        }),
      ).resolves.toBeUndefined();
    });

    test('should reject an invalid delegation contract address', async () => {
      const config = plainToClass(InMemoryConfiguration, {
        ...DEFAULTS,
        DELEGATION_CONTRACT_ADDRESS: 'not-an-address',
      });

      await expect(
        validateOrReject(config, {
          validationError: { target: false, value: false },
        }),
      ).rejects.toEqual([
        expect.objectContaining({
          property: 'DELEGATION_CONTRACT_ADDRESS',
        }),
      ]);
    });
  });

  describe('secrets from files', () => {
    const walletKey2 = Wallet.createRandom().privateKey;
    const files: Record<string, string> = {};

    const valueFor = (name: string, origin: 'env' | 'file') => {
      if (name === 'WALLET_PRIVATE_KEY_2') {
        return origin === 'file'
          ? walletKey2
          : Wallet.createRandom().privateKey;
      }
      if (URL_LIST_ENVS.includes(name)) {
        return `https://${origin}-1.example.com,https://${origin}-2.example.com`;
      }
      return `${origin}-${name}`;
    };

    const expectedFor = (name: string, origin: 'env' | 'file') =>
      URL_LIST_ENVS.includes(name)
        ? [`https://${origin}-1.example.com`, `https://${origin}-2.example.com`]
        : valueFor(name, origin);

    beforeEach(() => {
      for (const name of SECRET_ENVS) {
        files[name] = `${valueFor(name, 'file')}\n`;
      }
      files.empty = ' \n';
      files.separators = ',\n, ';
      files['list-commas'] = 'https://a.example.com/, https://b.example.com';
      files['list-lines'] = 'https://a.example.com\nhttps://b.example.com/\n';

      jest
        .spyOn(configLoaderService, 'readFile')
        .mockImplementation(async (path: string) => {
          if (path in files) return files[path];
          throw new Error('unknown path');
        });
    });

    test.each(SECRET_ENVS)('%s from env only', async (name) => {
      const env = valueFor(name, 'env');
      const config = await configLoaderService.loadSecrets(
        plainToClass(InMemoryConfiguration, { ...DEFAULTS, [name]: env }),
      );

      expect(config[name]).toEqual(
        URL_LIST_ENVS.includes(name) ? parseUrlList(env) : env,
      );
    });

    test.each(SECRET_ENVS)('%s from file only', async (name) => {
      const withoutEnv: Record<string, string> = { ...DEFAULTS };
      delete withoutEnv[name];
      const config = await configLoaderService.loadSecrets(
        plainToClass(InMemoryConfiguration, {
          ...withoutEnv,
          [`${name}_FILE`]: name,
        }),
      );

      expect(config[name]).toEqual(expectedFor(name, 'file'));
    });

    test.each(URL_LIST_ENVS)(
      '%s from a file without URLs fails',
      async (name) => {
        await expect(
          configLoaderService.loadSecrets(
            plainToClass(InMemoryConfiguration, {
              ...DEFAULTS,
              [`${name}_FILE`]: 'separators',
            }),
          ),
        ).rejects.toThrow(`${name}_FILE holds no URLs`);
      },
    );

    test.each(SECRET_ENVS)('%s from file wins over env', async (name) => {
      const config = await configLoaderService.loadSecrets(
        plainToClass(InMemoryConfiguration, {
          ...DEFAULTS,
          [name]: valueFor(name, 'env'),
          [`${name}_FILE`]: name,
        }),
      );

      expect(config[name]).toEqual(expectedFor(name, 'file'));
    });

    test.each(SECRET_ENVS)('%s from an empty file fails', async (name) => {
      await expect(
        configLoaderService.loadSecrets(
          plainToClass(InMemoryConfiguration, {
            ...DEFAULTS,
            [`${name}_FILE`]: 'empty',
          }),
        ),
      ).rejects.toThrow(`${name}_FILE points to an empty file`);
    });

    test.each(
      URL_LIST_ENVS.flatMap((name) => [
        [name, 'list-commas'],
        [name, 'list-lines'],
      ]),
    )('%s from a %s file', async (name, file) => {
      const config = await configLoaderService.loadSecrets(
        plainToClass(InMemoryConfiguration, {
          ...DEFAULTS,
          [`${name}_FILE`]: file,
        }),
      );

      expect(config[name]).toEqual([
        'https://a.example.com',
        'https://b.example.com',
      ]);
    });

    test('accepts PROVIDERS_URLS_FILE without RPC_URL', async () => {
      const { RPC_URL, ...withoutRpcUrl } = DEFAULTS;
      void RPC_URL;
      const config = await configLoaderService.loadSecrets(
        plainToClass(InMemoryConfiguration, {
          ...withoutRpcUrl,
          PROVIDERS_URLS_FILE: 'list-lines',
        }),
      );

      expect(config.PROVIDERS_URLS).toEqual([
        'https://a.example.com',
        'https://b.example.com',
      ]);
    });

    test('accepts EVM_CHAIN_DATA_BUS_PROVIDERS_URLS without EVM_CHAIN_DATA_BUS_PROVIDER_URL', async () => {
      const { EVM_CHAIN_DATA_BUS_PROVIDER_URL, ...withoutUrl } = DEFAULTS;
      void EVM_CHAIN_DATA_BUS_PROVIDER_URL;

      await expect(
        configLoaderService.loadSecrets(
          plainToClass(InMemoryConfiguration, {
            ...withoutUrl,
            EVM_CHAIN_DATA_BUS_PROVIDERS_URLS: 'https://a.example.com',
          }),
        ),
      ).resolves.toBeDefined();
    });

    test('rejects a config without RPC_URL and PROVIDERS_URLS', async () => {
      const { RPC_URL, ...withoutRpcUrl } = DEFAULTS;
      void RPC_URL;

      await expect(
        configLoaderService.loadSecrets(
          plainToClass(InMemoryConfiguration, withoutRpcUrl),
        ),
      ).rejects.toEqual([expect.objectContaining({ property: 'RPC_URL' })]);
    });
  });

  describe('parseUrlList', () => {
    test.each([
      ['https://a.example.com,https://b.example.com/', 2],
      ['https://a.example.com, https://b.example.com', 2],
      ['https://a.example.com\nhttps://b.example.com\n', 2],
      ['https://a.example.com/', 1],
    ])('parses %j', (value, count) => {
      const urls = parseUrlList(value);

      expect(urls).toHaveLength(count);
      urls?.forEach((url) => expect(url).not.toMatch(/[\s,]|\/$/));
    });

    test.each([undefined, null, '', ' , \n'])(
      'gives undefined for %j',
      (value) => {
        expect(parseUrlList(value)).toBeUndefined();
      },
    );
  });

  describe('log level', () => {
    test.each(['error', 'warn', 'info', 'debug'])(
      'accepts %s',
      async (level) => {
        await expect(
          validateOrReject(
            plainToClass(InMemoryConfiguration, {
              ...DEFAULTS,
              LOG_LEVEL: level,
            }),
          ),
        ).resolves.toBeUndefined();
      },
    );

    test.each(['warning', 'notice'])('rejects %s', async (level) => {
      await expect(
        validateOrReject(
          plainToClass(InMemoryConfiguration, {
            ...DEFAULTS,
            LOG_LEVEL: level,
          }),
          { validationError: { target: false, value: false } },
        ),
      ).rejects.toEqual([expect.objectContaining({ property: 'LOG_LEVEL' })]);
    });
  });

  describe('pubsub service', () => {
    test('should default to evm-chain', () => {
      const config = plainToClass(InMemoryConfiguration, DEFAULTS);

      expect(config.PUBSUB_SERVICE).toBe('evm-chain');
    });

    test.each(['rabbitmq', 'kafka'])('should reject %s', async (service) => {
      const config = plainToClass(InMemoryConfiguration, {
        ...DEFAULTS,
        PUBSUB_SERVICE: service,
      });

      await expect(
        validateOrReject(config, {
          validationError: { target: false, value: false },
        }),
      ).rejects.toEqual([
        expect.objectContaining({
          property: 'PUBSUB_SERVICE',
        }),
      ]);
    });
  });

  describe('dry run', () => {
    test('should be disabled by default', async () => {
      const config = plainToClass(InMemoryConfiguration, DEFAULTS);

      await validateOrReject(config);
      expect(config.DRY_RUN).toBe(false);
    });

    test.each([
      ['true', true],
      ['TRUE', true],
      ['false', false],
      ['', false],
    ])('should accept %p', async (value, expected) => {
      const config = plainToClass(InMemoryConfiguration, {
        ...DEFAULTS,
        DRY_RUN: value,
      });

      await validateOrReject(config);
      expect(config.DRY_RUN).toBe(expected);
    });

    test.each(['1', 'yes'])('should reject %p', async (value) => {
      const config = plainToClass(InMemoryConfiguration, {
        ...DEFAULTS,
        DRY_RUN: value,
      });

      await expect(
        validateOrReject(config, {
          validationError: { target: false, value: false },
        }),
      ).rejects.toEqual([expect.objectContaining({ property: 'DRY_RUN' })]);
    });
  });

  describe('wallet private keys', () => {
    const privateKeys = [
      '0x0000000000000000000000000000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000000000000000000000000000002',
    ];

    test('should accept the two named keys', async () => {
      const config = plainToClass(InMemoryConfiguration, {
        ...DEFAULTS,
        WALLET_PRIVATE_KEY: privateKeys[0],
        WALLET_PRIVATE_KEY_2: privateKeys[1],
      });

      await expect(configLoaderService.loadSecrets(config)).resolves.toEqual(
        expect.objectContaining({
          WALLET_PRIVATE_KEY: privateKeys[0],
          WALLET_PRIVATE_KEY_2: privateKeys[1],
        }),
      );
    });

    test('should accept only the first key', async () => {
      const config = plainToClass(InMemoryConfiguration, {
        ...DEFAULTS,
        WALLET_PRIVATE_KEY: privateKeys[0],
      });

      await expect(configLoaderService.loadSecrets(config)).resolves.toEqual(
        expect.objectContaining({
          WALLET_PRIVATE_KEY: privateKeys[0],
          WALLET_PRIVATE_KEY_2: '',
        }),
      );
    });

    test('should read a key from the file specified by the _FILE variant', async () => {
      const config = plainToClass(InMemoryConfiguration, {
        ...DEFAULTS,
        WALLET_PRIVATE_KEY_2_FILE: 'some-path',
      });
      jest
        .spyOn(configLoaderService, 'readFile')
        .mockImplementation(async () => privateKeys[1]);

      await expect(configLoaderService.loadSecrets(config)).resolves.toEqual(
        expect.objectContaining({ WALLET_PRIVATE_KEY_2: privateKeys[1] }),
      );
    });

    test('should reject an invalid private key', async () => {
      const config = plainToClass(InMemoryConfiguration, {
        ...DEFAULTS,
        WALLET_PRIVATE_KEY_2: 'invalid',
      });

      await expect(configLoaderService.loadSecrets(config)).rejects.toEqual([
        expect.objectContaining({ property: 'WALLET_PRIVATE_KEY_2' }),
      ]);
    });

    test('should reject a zero private key', async () => {
      const config = plainToClass(InMemoryConfiguration, {
        ...DEFAULTS,
        WALLET_PRIVATE_KEY_2: `0x${'0'.repeat(64)}`,
      });

      await expect(configLoaderService.loadSecrets(config)).rejects.toEqual([
        expect.objectContaining({ property: 'WALLET_PRIVATE_KEY_2' }),
      ]);
    });
  });

  describe('balance', () => {
    test('should throw an error for an excessively small WALLET_CRITICAL_BALANCE', async () => {
      const WALLET_CRITICAL_BALANCE = '0.0000000000000000001';
      const plainConfig = plainToClass(InMemoryConfiguration, {
        WALLET_CRITICAL_BALANCE,
        ...DEFAULTS,
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
        ...DEFAULTS,
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
        ...DEFAULTS,
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
        ...DEFAULTS,
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
        ...DEFAULTS,
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
        ...DEFAULTS,
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
        ...DEFAULTS,
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
        ...DEFAULTS,
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
