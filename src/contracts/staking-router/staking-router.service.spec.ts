import { Test } from '@nestjs/testing';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { MockProviderModule } from 'provider';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { RepositoryModule, RepositoryService } from 'contracts/repository';
import { Interface } from '@ethersproject/abi';
import { LocatorService } from 'contracts/repository/locator/locator.service';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { mockLocator } from 'contracts/repository/locator/locator.mock';
import { mockRepository } from 'contracts/repository/repository.mock';
import { StakingRouterAbi__factory, LidoAbi__factory } from 'generated';
import { StakingRouterModule, StakingRouterService } from '.';
import { BigNumber } from '@ethersproject/bignumber';

const TEST_MODULE_ID = 1;

describe('SecurityService', () => {
  let provider: SimpleFallbackJsonRpcBatchProvider;
  let repositoryService: RepositoryService;
  let locatorService: LocatorService;
  let stakingRouterService: StakingRouterService;
  let logger: any;

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

    provider = moduleRef.get(SimpleFallbackJsonRpcBatchProvider);
    repositoryService = moduleRef.get(RepositoryService);
    locatorService = moduleRef.get(LocatorService);
    stakingRouterService = moduleRef.get(StakingRouterService);

    logger = moduleRef.get(WINSTON_MODULE_NEST_PROVIDER);
    jest.spyOn(logger, 'log').mockImplementation(() => undefined);
    jest.spyOn(logger, 'warn').mockImplementation(() => undefined);

    mockLocator(locatorService);
    await mockRepository(repositoryService);
  });

  describe('isDepositsPaused', () => {
    it('should call contract method', async () => {
      const expected = true;

      const mockProviderCalla = jest
        .spyOn(provider, 'call')
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
      expect(mockProviderCalla).toHaveBeenCalledTimes(1);
    });
  });

  describe('getWithdrawalCredentials', () => {
    it('should return withdrawal credentials', async () => {
      const expected = '0x' + '1'.repeat(64);

      const mockProviderCall = jest
        .spyOn(provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(StakingRouterAbi__factory.abi);
          const result = [expected];
          return iface.encodeFunctionResult('getWithdrawalCredentials', result);
        });

      const wc = await await stakingRouterService.getWithdrawalCredentials();
      expect(wc).toBe(expected);
      expect(mockProviderCall).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStakingModuleMaxDepositsCount', () => {
    it('should return max deposits count for module', async () => {
      const expected = 10;

      const mockProviderCall = jest
        .spyOn(provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(StakingRouterAbi__factory.abi);
          return iface.encodeFunctionResult(
            'getStakingModuleMaxDepositsCount',
            [expected],
          );
        });

      const result =
        await stakingRouterService.getStakingModuleMaxDepositsCount(
          TEST_MODULE_ID,
          BigNumber.from('320000000000000000000'),
        );
      expect(result).toBe(expected);
      expect(mockProviderCall).toHaveBeenCalledTimes(1);
    });

    it('should return 0 when module has no allocation', async () => {
      jest.spyOn(provider, 'call').mockImplementation(async () => {
        const iface = new Interface(StakingRouterAbi__factory.abi);
        return iface.encodeFunctionResult('getStakingModuleMaxDepositsCount', [
          0,
        ]);
      });

      const result =
        await stakingRouterService.getStakingModuleMaxDepositsCount(
          TEST_MODULE_ID,
          BigNumber.from('320000000000000000000'),
        );
      expect(result).toBe(0);
    });

    it('should return 0 on MATH_SUB_UNDERFLOW', async () => {
      jest
        .spyOn(repositoryService, 'getCachedStakingRouterContract')
        .mockReturnValue({
          getStakingModuleMaxDepositsCount: jest.fn().mockRejectedValue({
            code: 'CALL_EXCEPTION',
            reason: 'MATH_SUB_UNDERFLOW',
            message: 'call revert exception: MATH_SUB_UNDERFLOW',
          }),
        } as any);

      const result =
        await stakingRouterService.getStakingModuleMaxDepositsCount(
          TEST_MODULE_ID,
          BigNumber.from('32000000000000000000'),
        );

      expect(result).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith(
        'Treat staking module allocation underflow as zero',
        expect.objectContaining({
          stakingModuleId: TEST_MODULE_ID,
          maxDepositsValue: '32000000000000000000',
        }),
      );
    });

    it('should rethrow non-CALL_EXCEPTION errors', async () => {
      jest
        .spyOn(repositoryService, 'getCachedStakingRouterContract')
        .mockReturnValue({
          getStakingModuleMaxDepositsCount: jest
            .fn()
            .mockRejectedValue(new Error('network timeout')),
        } as any);

      await expect(
        stakingRouterService.getStakingModuleMaxDepositsCount(
          TEST_MODULE_ID,
          BigNumber.from('32000000000000000000'),
        ),
      ).rejects.toThrow('network timeout');
    });
  });

  describe('getDepositableEther', () => {
    it('should return depositable ether from Lido contract', async () => {
      const expected = BigNumber.from('640000000000000000000');

      const mockProviderCall = jest
        .spyOn(provider, 'call')
        .mockImplementation(async () => {
          const iface = new Interface(LidoAbi__factory.abi);
          return iface.encodeFunctionResult('getDepositableEther', [expected]);
        });

      const result = await stakingRouterService.getDepositableEther();
      expect(result).toEqual(expected);
      expect(mockProviderCall).toHaveBeenCalledTimes(1);
    });
  });
});
