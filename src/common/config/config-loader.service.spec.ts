import { Test } from '@nestjs/testing';
import { plainToClass } from 'class-transformer';
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
});
