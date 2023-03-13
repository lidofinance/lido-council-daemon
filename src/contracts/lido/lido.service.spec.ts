import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { MockProviderModule, ProviderService } from 'provider';
import { LidoAbi__factory } from 'generated';
import { RepositoryModule, RepositoryService } from 'contracts/repository';
import { Interface } from '@ethersproject/abi';
import { LidoService } from './lido.service';
import { LidoModule } from './lido.module';
import { LocatorService } from 'contracts/repository/locator/locator.service';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

const mockLocator = (locator: LocatorService) => {
  const lidoAddr = jest
    .spyOn(locator, 'getLidoAddress')
    .mockImplementation(async () => '0x' + '1'.repeat(40));

  const DSMAddr = jest
    .spyOn(locator, 'getDSMAddress')
    .mockImplementation(async () => '0x' + '2'.repeat(40));
  const SRAddr = jest
    .spyOn(locator, 'getStakingRouterAddress')
    .mockImplementation(async () => '0x' + '3'.repeat(40));
  const locatorAddr = jest
    .spyOn(locator, 'getLocatorAddress')
    .mockImplementation(async () => '0x' + '4'.repeat(40));

  return { lidoAddr, locatorAddr, SRAddr, DSMAddr };
};

const mockRepository = async (repositoryService: RepositoryService) => {
  const address1 = '0x' + '5'.repeat(40);

  const depositAddr = jest
    .spyOn(repositoryService, 'getDepositAddress')
    .mockImplementation(async () => address1);

  await repositoryService.initCachedContracts('latest');
  jest.spyOn(repositoryService, 'getCachedLidoContract');

  return { depositAddr };
};

describe('SecurityService', () => {
  let lidoService: LidoService;
  let providerService: ProviderService;

  let repositoryService: RepositoryService;
  let locatorService: LocatorService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        LoggerModule,
        LidoModule,
        RepositoryModule,
      ],
    }).compile();

    lidoService = moduleRef.get(LidoService);
    providerService = moduleRef.get(ProviderService);

    repositoryService = moduleRef.get(RepositoryService);
    locatorService = moduleRef.get(LocatorService);
    jest
      .spyOn(moduleRef.get(WINSTON_MODULE_NEST_PROVIDER), 'log')
      .mockImplementation(() => undefined);

    mockLocator(locatorService);
    await mockRepository(repositoryService);
  });

  describe('getWithdrawalCredentials', () => {
    it('should return withdrawal credentials', async () => {
      const expected = '0x' + '1'.repeat(64);

      const mockProviderCall = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(LidoAbi__factory.abi);
          const result = [expected];
          return iface.encodeFunctionResult('getWithdrawalCredentials', result);
        });

      const wc = await lidoService.getWithdrawalCredentials();
      expect(wc).toBe(expected);
      expect(mockProviderCall).toBeCalledTimes(1);
    });
  });
});
