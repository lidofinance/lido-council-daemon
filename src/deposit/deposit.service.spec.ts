import { CHAINS } from '@lido-sdk/constants';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'common/logger';
import { LidoModule, LidoService } from 'lido';
import { ProviderModule, ProviderService } from 'provider';
import { DepositService } from './deposit.service';
import { DepositCacheService } from './cache.service';
import { Interface } from '@ethersproject/abi';
import { DepositAbi__factory } from 'generated';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { LoggerService } from '@nestjs/common';
import { ConfigModule } from 'common/config';
import { getNetwork } from '@ethersproject/networks';
import { Contract } from '@ethersproject/contracts';
import { hexZeroPad } from '@ethersproject/bytes';
import { JsonRpcProvider } from '@ethersproject/providers';

describe('DepositService', () => {
  let providerService: ProviderService;
  let lidoService: LidoService;
  let cacheService: DepositCacheService;
  let depositService: DepositService;
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
        LidoModule,
        ProviderModule,
      ],
      providers: [DepositService, DepositCacheService],
    })
      .overrideProvider(JsonRpcProvider)
      .useValue(new MockRpcProvider())
      .compile();

    providerService = moduleRef.get(ProviderService);
    lidoService = moduleRef.get(LidoService);
    cacheService = moduleRef.get(DepositCacheService);
    depositService = moduleRef.get(DepositService);
    loggerService = moduleRef.get(WINSTON_MODULE_NEST_PROVIDER);

    jest.spyOn(loggerService, 'log').mockImplementation(() => undefined);

    jest
      .spyOn(lidoService, 'getDepositContractAddress')
      .mockImplementation(async () => hexZeroPad('0x1', 20));
  });

  describe('formatEvents', () => {
    it.todo('should return event in the correct format');
  });

  describe('getContract', () => {
    it('should return contract instance', async () => {
      const contract = await depositService.getContract();
      expect(contract).toBeInstanceOf(Contract);
    });

    it('should cache instance', async () => {
      const contract1 = await depositService.getContract();
      const contract2 = await depositService.getContract();
      expect(contract1).toBe(contract2);
    });
  });

  describe('getDeploymentBlockByNetwork', () => {
    it('should return block number for goerli', async () => {
      jest
        .spyOn(providerService.provider, 'detectNetwork')
        .mockImplementation(async () => getNetwork(CHAINS.Goerli));

      const blockNumber = await depositService.getDeploymentBlockByNetwork();
      expect(typeof blockNumber).toBe('number');
      expect(blockNumber).toBeGreaterThan(0);
    });

    it('should return block number for mainnet', async () => {
      jest
        .spyOn(providerService.provider, 'detectNetwork')
        .mockImplementation(async () => getNetwork(CHAINS.Mainnet));

      const blockNumber = await depositService.getDeploymentBlockByNetwork();
      expect(typeof blockNumber).toBe('number');
      expect(blockNumber).toBeGreaterThan(0);
    });
  });

  describe('getCachedEvents', () => {
    it.todo('should return events from cache');
    it.todo('should return deploymentBlock if cache is empty');
  });

  describe('setCachedEvents', () => {
    it.todo('should call setCache from the cacheService');
  });

  describe('fetchEventsRecursive', () => {
    it.todo('should fetch events');
    it.todo('should fetch retry if error is unknown');
    it.todo('should fetch recursive if limit exceeded');
  });

  describe('fetchEvents', () => {
    it.todo('should fetch events');
  });

  describe('getFreshEvents', () => {
    it.todo('should fetch fresh events');
  });

  describe('subscribeToEthereumUpdates', () => {
    it.todo('should subscribe to block event');
  });

  describe('initialize', () => {
    it.todo('should collect cache');
    it.todo('should subscribe to updates');
  });

  describe('cacheEventsWrapped', () => {
    it.todo('should call cacheEvents');
  });

  describe('cacheEvents', () => {
    it.todo('should collect events');
    it.todo('should start collecting from the last cached block + 1');
    it.todo('should save events to the cache');
    it.todo('should exit if the previous call is not completed');
  });

  describe('getAllPubKeys', () => {
    const cachedPubkeys = ['0x1234', '0x5678'];
    const freshPubkeys = ['0x4321', '0x8765'];

    beforeEach(async () => {
      jest.spyOn(cacheService, 'getCache').mockImplementation(async () => ({
        startBlock: 0,
        endBlock: 2,
        events: cachedPubkeys.map((pubkey) => ({ pubkey } as any)),
      }));

      jest
        .spyOn(providerService.provider, 'getBlockNumber')
        .mockImplementation(async () => 3);
    });

    it('should return cached pub keys', async () => {
      const providerCall = jest
        .spyOn(providerService.provider, 'getLogs')
        .mockImplementation(async () => []);

      const result = await depositService.getAllPubKeys();
      const expected = new Set(cachedPubkeys);
      expect(result).toEqual(expected);
      expect(providerCall).toHaveBeenCalledTimes(1);
    });

    it('should return merged pub keys', async () => {
      const providerCall = jest
        .spyOn(providerService.provider, 'getLogs')
        .mockImplementation(async () => {
          const iface = new Interface(DepositAbi__factory.abi);
          const eventFragment = iface.getEvent('DepositEvent');

          return freshPubkeys.map((pubkey) => {
            const args = [pubkey, '0x', '0x', '0x', 1];
            return iface.encodeEventLog(eventFragment, args) as any;
          });
        });

      const result = await depositService.getAllPubKeys();
      const expected = new Set(cachedPubkeys.concat(freshPubkeys));
      expect(result).toEqual(expected);
      expect(providerCall).toHaveBeenCalledTimes(1);
    });

    it.todo('should throw if cache is old');
  });

  describe('getDepositRoot', () => {
    it('should return deposit root', async () => {
      const expected = '0x' + '0'.repeat(64);

      const providerCall = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(DepositAbi__factory.abi);
          return iface.encodeFunctionResult('get_deposit_root', [expected]);
        });

      const result = await depositService.getDepositRoot();
      expect(result).toEqual(expected);
      expect(providerCall).toHaveBeenCalledTimes(1);
    });
  });
});
