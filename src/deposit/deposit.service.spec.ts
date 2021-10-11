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

describe('DepositService', () => {
  let providerService: ProviderService;
  let lidoService: LidoService;
  let cacheService: DepositCacheService;
  let depositService: DepositService;
  let loggerService: LoggerService;

  let depositAddress: string;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [LoggerModule, LidoModule, ProviderModule],
      providers: [DepositService, DepositCacheService],
    }).compile();

    providerService = moduleRef.get(ProviderService);
    lidoService = moduleRef.get(LidoService);
    cacheService = moduleRef.get(DepositCacheService);
    depositService = moduleRef.get(DepositService);
    loggerService = moduleRef.get(WINSTON_MODULE_NEST_PROVIDER);

    depositAddress = '0x' + '0'.repeat(40);

    jest
      .spyOn(providerService, 'getChainId')
      .mockImplementation(async () => CHAINS.Goerli);

    jest
      .spyOn(lidoService, 'getDepositContractAddress')
      .mockImplementation(async () => depositAddress);

    jest.spyOn(loggerService, 'log').mockImplementation(() => undefined);
  });

  describe('getDepositAddress', () => {
    it('should return deposit address', async () => {
      const result = await depositService.getDepositAddress();
      expect(result).toEqual(depositAddress);
    });
  });

  describe('collectNewEvents', () => {
    it.todo('should collect events');
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
