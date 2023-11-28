import { Test, TestingModule } from '@nestjs/testing';
import { UnusedKeysValidationService } from './unused-keys-validation.service';
import { BlsModule, BlsService } from 'bls';
import { LoggerModule } from 'common/logger';
import { MockProviderModule, ProviderService } from 'provider';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { LoggerService } from '@nestjs/common';
import { getNetwork } from '@ethersproject/networks';
import { CHAINS } from '@lido-sdk/constants';
import { ConfigModule } from 'common/config';

const LIDO_WC =
  '0x010000000000000000000000b9d7934878b5fb9610b3fe8a5e441e8fad7e293f';

describe('UnusedKeysValidationService', () => {
  let service: UnusedKeysValidationService;
  let loggerService: LoggerService;
  let providerService: ProviderService;
  let blsService: BlsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        LoggerModule,
        BlsModule,
      ],
      providers: [UnusedKeysValidationService],
    }).compile();

    loggerService = module.get(WINSTON_MODULE_NEST_PROVIDER);
    providerService = module.get(ProviderService);

    jest.spyOn(loggerService, 'log').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'warn').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'debug').mockImplementation(() => undefined);

    jest
      .spyOn(providerService.provider, 'detectNetwork')
      .mockImplementation(async () => getNetwork(CHAINS.Mainnet));

    blsService = module.get(BlsService);
    await blsService.onModuleInit();

    service = module.get<UnusedKeysValidationService>(
      UnusedKeysValidationService,
    );
  });

  afterEach(() => {
    service.clearCache();
  });

  it('should add a new key', async () => {
    const newKey = {
      key: '0x905af9271622b44047855e82f27bc100a4a67b0a6a2772ff67583b1a2fd8ee59ba5482a083235d639b550e2cf87479d9',
      depositSignature:
        '0x88e586f721403eb86c2bf3348377bf8e229a814aefa60abf9d2cb98154ec3a1f3ba551114169f99eb7bcdab0ce966dcc05ee47a4749c62a90e8d0ac0fdfaaac5ffef1840c7305797a9f41cb76be2dd019bfdf12a83d4f91a89828dd936182061',
      operatorIndex: 30,
      used: false,
      index: 394,
      moduleAddress: '0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5',
    };
    jest.spyOn(service, 'validate');

    const isValid = service.validateAndCacheKey(LIDO_WC, newKey);
    expect(service.validate).toHaveBeenCalled();
    expect(isValid).toBe(true);
    const cachedData = service['store'].get(newKey.key);
    expect(cachedData).toBeDefined();
    expect(cachedData?.operatorIndex).toBe(newKey.operatorIndex);
    expect(cachedData?.depositSignature).toBe(newKey.depositSignature);
    expect(cachedData?.isValid).toBe(isValid);
  });

  it('should update an existing key with a new signature', () => {
    // for example operator uploaded with wrong signature
    const newKey = {
      key: '0x905af9271622b44047855e82f27bc100a4a67b0a6a2772ff67583b1a2fd8ee59ba5482a083235d639b550e2cf87479d9',
      depositSignature:
        '0xa13833d96f4b98291dbf428cb69e7a3bdce61c9d20efcdb276423c7d6199ebd10cf1728dbd418c592701a41983cb02330e736610be254f617140af48a9d20b31cdffdd1d4fc8c0776439fca3330337d33042768acf897000b9e5da386077be44',
      operatorIndex: 30,
      used: false,
      index: 394,
      moduleAddress: '0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5',
    };
    const isValid = service.validateAndCacheKey(LIDO_WC, newKey);
    expect(service['store'].size).toBe(1);
    expect(isValid).toBe(false);
    jest.spyOn(service, 'validate');

    // operator want to fix
    const updatedKey = {
      ...newKey,
      depositSignature:
        '0x88e586f721403eb86c2bf3348377bf8e229a814aefa60abf9d2cb98154ec3a1f3ba551114169f99eb7bcdab0ce966dcc05ee47a4749c62a90e8d0ac0fdfaaac5ffef1840c7305797a9f41cb76be2dd019bfdf12a83d4f91a89828dd936182061',
    };
    const isValidAfterUpdate = service.validateAndCacheKey(LIDO_WC, updatedKey);
    expect(isValidAfterUpdate).toBe(true);
    expect(service.validate).toHaveBeenCalled();
    const cachedData = service['store'].get(updatedKey.key);
    expect(service['store'].size).toBe(1);
    expect(cachedData?.depositSignature).toBe(updatedKey.depositSignature);
  });

  it('should update data and validate again if index was changed', () => {
    // Before this check, we verify that there are no duplicates of the vetted key.
    // Thus, we should not find duplicates in the vetted list at this step.
    // However, it's theoretically possible that a node operator might remove a key and then add it again with a new index.
    // In such cases, we need to validate the key again and update it in the cache.
    // for example operator uploaded with wrong signature
    const newKey = {
      key: '0x905af9271622b44047855e82f27bc100a4a67b0a6a2772ff67583b1a2fd8ee59ba5482a083235d639b550e2cf87479d9',
      depositSignature:
        '0x88e586f721403eb86c2bf3348377bf8e229a814aefa60abf9d2cb98154ec3a1f3ba551114169f99eb7bcdab0ce966dcc05ee47a4749c62a90e8d0ac0fdfaaac5ffef1840c7305797a9f41cb76be2dd019bfdf12a83d4f91a89828dd936182061',
      operatorIndex: 30,
      used: false,
      index: 394,
      moduleAddress: '0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5',
    };
    const isValid = service.validateAndCacheKey(LIDO_WC, newKey);
    expect(service['store'].size).toBe(1);
    expect(isValid).toBe(true);
    jest.spyOn(service, 'validate');

    // operator want to fix
    const updatedKey = {
      ...newKey,
      index: 395,
    };
    const isValidAfterUpdate = service.validateAndCacheKey(LIDO_WC, updatedKey);
    expect(isValidAfterUpdate).toBe(true);
    expect(service.validate).toHaveBeenCalled();
    const cachedData = service['store'].get(updatedKey.key);
    expect(service['store'].size).toBe(1);
    expect(cachedData?.index).toBe(395);
  });

  it('should update data and validate again if operatorIndex and/or moduleAddress were changed', () => {
    // the same could happen with operatorIndex (but it is strange) and moduleAddress
    const newKey = {
      key: '0x905af9271622b44047855e82f27bc100a4a67b0a6a2772ff67583b1a2fd8ee59ba5482a083235d639b550e2cf87479d9',
      depositSignature:
        '0x88e586f721403eb86c2bf3348377bf8e229a814aefa60abf9d2cb98154ec3a1f3ba551114169f99eb7bcdab0ce966dcc05ee47a4749c62a90e8d0ac0fdfaaac5ffef1840c7305797a9f41cb76be2dd019bfdf12a83d4f91a89828dd936182061',
      operatorIndex: 30,
      used: false,
      index: 394,
      moduleAddress: '0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5',
    };
    const isValid = service.validateAndCacheKey(LIDO_WC, newKey);
    expect(service['store'].size).toBe(1);
    expect(isValid).toBe(true);
    jest.spyOn(service, 'validate');

    const updatedKey = {
      ...newKey,
      operatorIndex: 31,
      moduleAddress: '0x11a93807078f8BB880c1BD0ee4C387537de4b4b6',
    };
    const isValidAfterUpdate = service.validateAndCacheKey(LIDO_WC, updatedKey);
    expect(isValidAfterUpdate).toBe(true);
    expect(service.validate).toHaveBeenCalled();
    const cachedData = service['store'].get(updatedKey.key);
    expect(service['store'].size).toBe(1);
    expect(cachedData?.moduleAddress).toBe(
      '0x11a93807078f8BB880c1BD0ee4C387537de4b4b6',
    );
    expect(cachedData?.operatorIndex).toBe(31);
  });

  it('shouldnt do anything if data was not changed', () => {
    // the same could happen with operatorIndex (but it is strange) and moduleAddress
    const newKey = {
      key: '0x905af9271622b44047855e82f27bc100a4a67b0a6a2772ff67583b1a2fd8ee59ba5482a083235d639b550e2cf87479d9',
      depositSignature:
        '0x88e586f721403eb86c2bf3348377bf8e229a814aefa60abf9d2cb98154ec3a1f3ba551114169f99eb7bcdab0ce966dcc05ee47a4749c62a90e8d0ac0fdfaaac5ffef1840c7305797a9f41cb76be2dd019bfdf12a83d4f91a89828dd936182061',
      operatorIndex: 30,
      used: false,
      index: 394,
      moduleAddress: '0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5',
    };
    const isValid = service.validateAndCacheKey(LIDO_WC, newKey);
    expect(service['store'].size).toBe(1);
    expect(isValid).toBe(true);
    jest.spyOn(service, 'validate');

    const copyKey = {
      ...newKey,
    };
    const isValidAfterUpdate = service.validateAndCacheKey(LIDO_WC, copyKey);
    expect(isValidAfterUpdate).toBe(true);
    expect(service.validate).not.toHaveBeenCalled();
    const cachedData = service['store'].get(copyKey.key);
    expect(service['store'].size).toBe(1);
    expect(cachedData).toEqual({
      depositSignature:
        '0x88e586f721403eb86c2bf3348377bf8e229a814aefa60abf9d2cb98154ec3a1f3ba551114169f99eb7bcdab0ce966dcc05ee47a4749c62a90e8d0ac0fdfaaac5ffef1840c7305797a9f41cb76be2dd019bfdf12a83d4f91a89828dd936182061',
      operatorIndex: 30,
      isValid: true,
      index: 394,
      moduleAddress: '0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5',
    });
  });

  test('Should validate and add list of keys', () => {
    const keys = [
      {
        key: '0x905af9271622b44047855e82f27bc100a4a67b0a6a2772ff67583b1a2fd8ee59ba5482a083235d639b550e2cf87479d9',
        depositSignature:
          '0x88e586f721403eb86c2bf3348377bf8e229a814aefa60abf9d2cb98154ec3a1f3ba551114169f99eb7bcdab0ce966dcc05ee47a4749c62a90e8d0ac0fdfaaac5ffef1840c7305797a9f41cb76be2dd019bfdf12a83d4f91a89828dd936182061',
        operatorIndex: 30,
        used: false,
        index: 394,
        moduleAddress: '0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5',
      },
      {
        key: '0xaa220d5948e34f4d1a29032bc7ed2fa53c6102fce04a40b76b62943045f69352789f89f57ff8b334876173317c9a76df',
        depositSignature:
          '0xa199c151dbf8874ccd61fa8bcfac19d696662b82d049fffcc9045a7b7ff64e380a23bc020a49a3f172cabb896dcc841f14ae6015683dfbdf024dd4dc91b1eb7aec43c76cd00b9627b9a7cfc85442ab185bc640253e2904ee7446dca69f3a1fed',
        operatorIndex: 30,
        used: true,
        index: 440,
        moduleAddress: '0x55032650b14df07b85bF18A3a3eC8E0Af2e028d5',
      },
    ];
    jest.spyOn(service, 'validate');

    const invalidKeys = service.validateAndCacheList(LIDO_WC, keys);
    expect(service.validate).toHaveBeenCalledTimes(2);
    expect(invalidKeys).toEqual([]);
  });
});
