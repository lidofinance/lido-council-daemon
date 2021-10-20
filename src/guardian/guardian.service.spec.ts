import { CHAINS } from '@lido-sdk/constants';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'common/logger';
import { ProviderModule, ProviderService } from 'provider';
import { GuardianService } from './guardian.service';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { LoggerService } from '@nestjs/common';
import { ConfigModule } from 'common/config';
import { getNetwork } from '@ethersproject/networks';
import { JsonRpcProvider } from '@ethersproject/providers';
import { RegistryModule } from 'contracts/registry';
import { DepositModule } from 'contracts/deposit';
import { SecurityModule } from 'contracts/security';
import { MessagesModule } from 'messages';
import { PrometheusModule } from 'common/prometheus';

describe('GuardianService', () => {
  let providerService: ProviderService;
  let guardianService: GuardianService;
  let loggerService: LoggerService;

  beforeEach(async () => {
    class MockRpcProvider extends JsonRpcProvider {
      async _uncachedDetectNetwork() {
        return getNetwork(CHAINS.Goerli);
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        LoggerModule,
        PrometheusModule,
        ProviderModule,
        RegistryModule,
        DepositModule,
        SecurityModule,
        MessagesModule,
      ],
      providers: [GuardianService],
    })
      .overrideProvider(JsonRpcProvider)
      .useValue(new MockRpcProvider())
      .compile();

    providerService = moduleRef.get(ProviderService);
    guardianService = moduleRef.get(GuardianService);
    loggerService = moduleRef.get(WINSTON_MODULE_NEST_PROVIDER);

    jest.spyOn(loggerService, 'log').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'warn').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'debug').mockImplementation(() => undefined);
  });

  describe('onModuleInit', () => {
    it.todo('should init deposit service');
    it.todo('should subscribe to updates');
  });

  describe('subscribeToEthereumUpdates', () => {
    it('should subscribe to updates', () => {
      const mockOn = jest
        .spyOn(providerService.provider, 'on')
        .mockImplementation(() => undefined as any);

      guardianService.subscribeToEthereumUpdates();
      expect(mockOn).toBeCalledTimes(1);
      expect(mockOn).toBeCalledWith('block', expect.any(Function));
    });
  });

  describe('getKeysIntersections', () => {
    it('should find the keys when they match', () => {
      const nextLidoKeys = ['0x1'];
      const depositedKeys = new Set(['0x1']);
      const matched = guardianService.getKeysIntersections(
        nextLidoKeys,
        depositedKeys,
      );

      expect(matched).toBeInstanceOf(Array);
      expect(matched).toHaveLength(1);
      expect(matched).toContain('0x1');
    });

    it('should not find the keys when they don’t match', () => {
      const nextLidoKeys = ['0x2'];
      const depositedKeys = new Set(['0x1']);
      const matched = guardianService.getKeysIntersections(
        nextLidoKeys,
        depositedKeys,
      );

      expect(matched).toBeInstanceOf(Array);
      expect(matched).toHaveLength(0);
    });

    it('should work if array is empty', () => {
      const nextLidoKeys = [];
      const depositedKeys = new Set(['0x1']);
      const matched = guardianService.getKeysIntersections(
        nextLidoKeys,
        depositedKeys,
      );

      expect(matched).toBeInstanceOf(Array);
      expect(matched).toHaveLength(0);
    });
  });

  describe('getCurrentBlockData', () => {
    it.todo('should collect data from contracts');
  });

  describe('checkKeysIntersections', () => {
    const depositedPubKeys = ['0x1234', '0x5678'];

    const currentBlockData = {
      blockNumber: 1,
      blockHash: '0x1234',
      depositRoot: '0x2345',
      keysOpIndex: 1,
      nextSigningKeys: [] as string[],
      depositedPubKeys: new Set(depositedPubKeys),
      guardianAddress: '0x3456',
      guardianIndex: 1,
      isDepositsPaused: false,
    };

    beforeEach(async () => {
      jest
        .spyOn(guardianService, 'getCurrentBlockData')
        .mockImplementation(async () => currentBlockData);
    });

    it('should call handleKeysIntersections if Lido unused key is found in the deposit contract', async () => {
      const depositedKey = depositedPubKeys[0];
      const nextSigningKeys = [depositedKey];
      const blockData = { ...currentBlockData, nextSigningKeys };

      const mockGetCurrentBlockData = jest
        .spyOn(guardianService, 'getCurrentBlockData')
        .mockImplementation(async () => blockData);

      const mockHandleCorrectKeys = jest
        .spyOn(guardianService, 'handleCorrectKeys')
        .mockImplementation(async () => undefined);

      const mockHandleKeysIntersections = jest
        .spyOn(guardianService, 'handleKeysIntersections')
        .mockImplementation(async () => undefined);

      await guardianService.checkKeysIntersections();

      expect(mockHandleCorrectKeys).not.toBeCalled();
      expect(mockGetCurrentBlockData).toBeCalledTimes(1);
      expect(mockHandleKeysIntersections).toBeCalledTimes(1);
      expect(mockHandleKeysIntersections).toBeCalledWith(blockData, [
        depositedKey,
      ]);
    });

    it('should call handleCorrectKeys if Lido unused key are not found in the deposit contract', async () => {
      const notDepositedKey = '0x2345';
      const nextSigningKeys = [notDepositedKey];
      const blockData = { ...currentBlockData, nextSigningKeys };

      const mockGetCurrentBlockData = jest
        .spyOn(guardianService, 'getCurrentBlockData')
        .mockImplementation(async () => blockData);

      const mockHandleCorrectKeys = jest
        .spyOn(guardianService, 'handleCorrectKeys')
        .mockImplementation(async () => undefined);

      const mockHandleKeysIntersections = jest
        .spyOn(guardianService, 'handleKeysIntersections')
        .mockImplementation(async () => undefined);

      await guardianService.checkKeysIntersections();

      expect(mockGetCurrentBlockData).toBeCalledTimes(1);
      expect(mockHandleKeysIntersections).not.toBeCalled();
      expect(mockHandleCorrectKeys).toBeCalledTimes(1);
      expect(mockHandleCorrectKeys).toBeCalledWith(blockData);
    });

    it('should exit if the previous call is not completed', async () => {
      jest
        .spyOn(guardianService, 'handleCorrectKeys')
        .mockImplementation(async () => undefined);

      const mockGetCurrentBlockData = jest
        .spyOn(guardianService, 'getCurrentBlockData')
        .mockImplementation(async () => currentBlockData);

      await Promise.all([
        guardianService.checkKeysIntersections(),
        guardianService.checkKeysIntersections(),
      ]);

      expect(mockGetCurrentBlockData).toBeCalledTimes(1);
    });
  });

  describe('handleCorrectKeys', () => {
    it.todo('should check contracts state');
    it.todo('should exit if contracts state is the same');
    it.todo('should send deposit message');
    it.todo('should exit if it’s the same contracts state');
  });

  describe('handleKeysIntersections', () => {
    it.todo('should pause deposits');
    it.todo('should send pause message');
  });

  describe('isSameContractsStates', () => {
    it.todo('should return true if states are the same');
    it.todo('should return true if blockNumbers are close');
    it.todo('should return false if blockNumbers are too far');
    it.todo('should return false if depositRoot are different');
    it.todo('should return false if keysOpIndex are different');
  });

  describe('sendMessageFromGuardian', () => {
    it.todo('should send message if guardian is in the list');
    it.todo('should not send message if guardian is not in the list');
  });
});
