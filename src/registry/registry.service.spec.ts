import { Interface } from '@ethersproject/abi';
import { CHAINS } from '@lido-sdk/constants';
import { Test } from '@nestjs/testing';
import { LoggerModule } from 'common/logger';
import { RegistryAbi__factory } from 'generated';
import { LidoModule, LidoService } from 'lido';
import { ProviderModule, ProviderService } from 'provider';
import { SecurityModule, SecurityService } from 'security';
import { RegistryService } from './registry.service';

describe('RegistryService', () => {
  let providerService: ProviderService;
  let lidoService: LidoService;
  let registryService: RegistryService;
  let securityService: SecurityService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [LoggerModule, LidoModule, ProviderModule, SecurityModule],
      providers: [RegistryService],
    }).compile();

    providerService = moduleRef.get(ProviderService);
    lidoService = moduleRef.get(LidoService);
    registryService = moduleRef.get(RegistryService);
    securityService = moduleRef.get(SecurityService);

    jest
      .spyOn(providerService, 'getChainId')
      .mockImplementation(async () => CHAINS.Goerli);
  });

  describe('getPubkeyLength', () => {
    const keyLength = 2;

    beforeEach(async () => {
      jest
        .spyOn(registryService, 'getPubkeyLength')
        .mockImplementation(async () => keyLength);
    });

    it('should return an array of keys', async () => {
      const result = await registryService.splitPubKeys('0x12345678');
      expect(result).toEqual(['0x1234', '0x5678']);
    });

    it('should work with empty keys', async () => {
      const result = await registryService.splitPubKeys('0x');
      expect(result).toEqual([]);
    });

    it('should throw if source string is not divisible by the key length', async () => {
      await expect(registryService.splitPubKeys('0x12345')).rejects.toThrow();
    });
  });

  describe('getNextKeys', () => {
    const lidoAddress = '0x' + '0'.repeat(40);
    const keyLength = 2;
    const pubkeys = '0x12345678';
    const expected = ['0x1234', '0x5678'];

    it('should return splitted pubkeys', async () => {
      jest
        .spyOn(lidoService, 'getLidoAddress')
        .mockImplementation(async () => lidoAddress);

      jest
        .spyOn(securityService, 'getMaxDeposits')
        .mockImplementation(async () => 10);

      jest
        .spyOn(registryService, 'getPubkeyLength')
        .mockImplementation(async () => keyLength);

      const providerCall = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(RegistryAbi__factory.abi);
          const result = [pubkeys, '0x'];

          return iface.encodeFunctionResult('assignNextSigningKeys', result);
        });

      const result = await registryService.getNextKeys();

      expect(result).toEqual(expected);
      expect(providerCall).toHaveBeenCalledTimes(1);
    });
  });

  describe('getKeysOpIndex', () => {
    it.todo('should return keys operation index');
  });
});
