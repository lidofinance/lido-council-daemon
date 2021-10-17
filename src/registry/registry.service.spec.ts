import { Interface } from '@ethersproject/abi';
import { isAddress } from '@ethersproject/address';
import { BigNumber } from '@ethersproject/bignumber';
import { Contract } from '@ethersproject/contracts';
import { AddressZero } from '@ethersproject/constants';
import { CHAINS } from '@lido-sdk/constants';
import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { RegistryAbi__factory } from 'generated';
import { LidoModule, LidoService } from 'lido';
import { ProviderModule, ProviderService } from 'provider';
import { SecurityModule, SecurityService } from 'security';
import { RegistryService } from './registry.service';
import { getNetwork } from '@ethersproject/networks';
import { JsonRpcProvider } from '@ethersproject/providers';
import { PrometheusModule } from 'common/prometheus';

describe('RegistryService', () => {
  let providerService: ProviderService;
  let lidoService: LidoService;
  let registryService: RegistryService;
  let securityService: SecurityService;

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
        LidoModule,
        ProviderModule,
        SecurityModule,
      ],
      providers: [RegistryService],
    })
      .overrideProvider(JsonRpcProvider)
      .useValue(new MockRpcProvider())
      .compile();

    providerService = moduleRef.get(ProviderService);
    lidoService = moduleRef.get(LidoService);
    registryService = moduleRef.get(RegistryService);
    securityService = moduleRef.get(SecurityService);
  });

  describe('getContract', () => {
    it('should return contract instance', async () => {
      const contract = await registryService.getContract();
      expect(contract).toBeInstanceOf(Contract);
    });

    it('should cache instance', async () => {
      const contract1 = await registryService.getContract();
      const contract2 = await registryService.getContract();
      expect(contract1).toBe(contract2);
    });
  });

  describe('getPubkeyLength', () => {
    it('should return key length from contract', async () => {
      const expected = 10;

      const mockProviderCall = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(RegistryAbi__factory.abi);
          const result = [BigNumber.from(expected).toHexString()];
          return iface.encodeFunctionResult('PUBKEY_LENGTH', result);
        });

      const prefix = await registryService.getPubkeyLength();
      expect(prefix).toBe(expected);
      expect(mockProviderCall).toBeCalledTimes(1);
    });
  });

  describe('splitPubKeys', () => {
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

  describe('splitPubKeysArray', () => {
    it('should split array into two chunks', () => {
      const splitted = registryService.splitPubKeysArray(
        Uint8Array.from([1, 2, 3, 4]),
        2,
      );

      expect(splitted).toEqual([
        Uint8Array.from([1, 2]),
        Uint8Array.from([3, 4]),
      ]);
    });

    it('should work with empty array', () => {
      const splitted = registryService.splitPubKeysArray(
        Uint8Array.from([]),
        2,
      );
      expect(splitted).toEqual([]);
    });

    it('should throw if length is not divisible by the key length', () => {
      expect(() =>
        registryService.splitPubKeysArray(Uint8Array.from([1, 2, 3]), 2),
      ).toThrow();
    });
  });

  describe('getRegistryAddress', () => {
    it('should return contract address for goerli', async () => {
      jest
        .spyOn(providerService.provider, 'detectNetwork')
        .mockImplementation(async () => getNetwork(CHAINS.Goerli));

      const address = await registryService.getRegistryAddress();
      expect(isAddress(address)).toBeTruthy();
      expect(address).not.toBe(AddressZero);
    });

    it('should return contract address for mainnet', async () => {
      jest
        .spyOn(providerService.provider, 'detectNetwork')
        .mockImplementation(async () => getNetwork(CHAINS.Mainnet));

      const address = await registryService.getRegistryAddress();
      expect(isAddress(address)).toBeTruthy();
      expect(address).not.toBe(AddressZero);
    });
  });

  describe('getNextSigningKeys', () => {
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

      const mockProviderCall = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(RegistryAbi__factory.abi);
          const result = [pubkeys, '0x'];

          return iface.encodeFunctionResult('assignNextSigningKeys', result);
        });

      const result = await registryService.getNextSigningKeys();

      expect(result).toEqual(expected);
      expect(mockProviderCall).toBeCalledTimes(1);
    });
  });

  describe('getKeysOpIndex', () => {
    it('should return keys operation index', async () => {
      const expected = 10;

      const mockProviderCall = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(RegistryAbi__factory.abi);
          const result = [BigNumber.from(expected).toHexString()];
          return iface.encodeFunctionResult('getKeysOpIndex', result);
        });

      const keysOpIndex = await registryService.getKeysOpIndex();
      expect(keysOpIndex).toBe(expected);
      expect(mockProviderCall).toBeCalledTimes(1);
    });
  });
});
