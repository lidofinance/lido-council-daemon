import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { MockProviderModule, ProviderService } from 'provider';
import { RepositoryModule, RepositoryService } from 'contracts/repository';
import { Interface } from '@ethersproject/abi';
import { LocatorService } from 'contracts/repository/locator/locator.service';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { mockLocator } from 'contracts/repository/locator/locator.mock';
import { mockRepository } from 'contracts/repository/repository.mock';
import { StakingRouterAbi__factory } from 'generated';
import { StakingRouterModule, StakingRouterService } from '.';

const TEST_MODULE_ID = 1;

describe('SecurityService', () => {
  let providerService: ProviderService;
  let repositoryService: RepositoryService;
  let locatorService: LocatorService;
  let stakingRouterService: StakingRouterService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        LoggerModule,
        RepositoryModule,
        StakingRouterModule,
      ],
    }).compile();

    providerService = moduleRef.get(ProviderService);
    repositoryService = moduleRef.get(RepositoryService);
    locatorService = moduleRef.get(LocatorService);
    stakingRouterService = moduleRef.get(StakingRouterService);

    jest
      .spyOn(moduleRef.get(WINSTON_MODULE_NEST_PROVIDER), 'log')
      .mockImplementation(() => undefined);

    mockLocator(locatorService);
    await mockRepository(repositoryService);
  });

  describe('isDepositsPaused', () => {
    it('should call contract method', async () => {
      const expected = true;

      const mockProviderCalla = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(StakingRouterAbi__factory.abi);
          return iface.encodeFunctionResult('getStakingModuleIsActive', [
            expected,
          ]);
        });

      const isPaused = await stakingRouterService.isModuleDepositsPaused(
        TEST_MODULE_ID,
      );
      expect(isPaused).toBe(!expected);
      expect(mockProviderCalla).toBeCalledTimes(1);
    });
  });

  describe('getWithdrawalCredentials', () => {
    it('should return withdrawal credentials', async () => {
      const expected = '0x' + '1'.repeat(64);

      const mockProviderCall = jest
        .spyOn(providerService.provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(StakingRouterAbi__factory.abi);
          const result = [expected];
          return iface.encodeFunctionResult('getWithdrawalCredentials', result);
        });

      const wc = await await stakingRouterService.getWithdrawalCredentials();
      expect(wc).toBe(expected);
      expect(mockProviderCall).toBeCalledTimes(1);
    });
  });
});
