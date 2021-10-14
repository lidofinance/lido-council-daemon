import { isAddress } from '@ethersproject/address';
import { Contract } from '@ethersproject/contracts';
import { AddressZero } from '@ethersproject/constants';
import { CHAINS } from '@lido-sdk/constants';
import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { ProviderModule, ProviderService } from 'provider';
import { LidoService } from './lido.service';
import { LidoAbi__factory } from 'generated';
import { Interface } from '@ethersproject/abi';
import { getNetwork } from '@ethersproject/networks';
import { JsonRpcProvider } from '@ethersproject/providers';
import { LoggerModule } from 'common/logger';
import { hexZeroPad } from '@ethersproject/bytes';

describe('LidoService', () => {
  let lidoService: LidoService;
  let providerService: ProviderService;

  beforeEach(async () => {
    class MockRpcProvider extends JsonRpcProvider {
      async _uncachedDetectNetwork() {
        return getNetwork(CHAINS.Goerli);
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot(), LoggerModule, ProviderModule],
      providers: [LidoService],
    })
      .overrideProvider(JsonRpcProvider)
      .useValue(new MockRpcProvider())
      .compile();

    lidoService = moduleRef.get(LidoService);
    providerService = moduleRef.get(ProviderService);
  });

  describe('getContract', () => {
    it('should return contract instance', async () => {
      const contract = await lidoService.getContract();
      expect(contract).toBeInstanceOf(Contract);
    });

    it('should cache instance', async () => {
      const contract1 = await lidoService.getContract();
      const contract2 = await lidoService.getContract();
      expect(contract1).toBe(contract2);
    });
  });

  describe('getLidoAddress', () => {
    it('should return contract address for goerli', async () => {
      jest
        .spyOn(providerService.provider, 'detectNetwork')
        .mockImplementation(async () => getNetwork(CHAINS.Goerli));

      const address = await lidoService.getLidoAddress();
      expect(isAddress(address)).toBeTruthy();
      expect(address).not.toBe(AddressZero);
    });

    it('should return contract address for mainnet', async () => {
      jest
        .spyOn(providerService.provider, 'detectNetwork')
        .mockImplementation(async () => getNetwork(CHAINS.Mainnet));

      const address = await lidoService.getLidoAddress();
      expect(isAddress(address)).toBeTruthy();
      expect(address).not.toBe(AddressZero);
    });
  });

  describe('getDepositContractAddress', () => {
    it('should return deposit contract address', async () => {
      const expected = hexZeroPad('0x1', 20);

      const providerCall = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(LidoAbi__factory.abi);
          const result = [expected];
          return iface.encodeFunctionResult('getDepositContract', result);
        });

      const address = await lidoService.getDepositContractAddress();
      expect(address).toBe(expected);
      expect(providerCall).toBeCalledTimes(1);
    });
  });
});
