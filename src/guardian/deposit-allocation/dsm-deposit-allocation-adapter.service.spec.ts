import { ethers } from 'ethers';
import { SecurityService } from 'contracts/security';
import { StakingRouterService } from 'contracts/staking-router';
import { StakingModuleData } from 'guardian/interfaces';
import { DsmDepositAllocationAdapterService } from './dsm-deposit-allocation-adapter.service';

const BLOCK_HASH = '0x' + '1'.repeat(64);
const ONE_DEPOSIT_VALUE = ethers.utils.parseEther('32');

describe('DsmDepositAllocationAdapterService', () => {
  let stakingRouterService: jest.Mocked<
    Pick<
      StakingRouterService,
      'getDepositableEther' | 'getStakingModuleMaxDepositsCount'
    >
  >;
  let securityService: jest.Mocked<Pick<SecurityService, 'version'>>;
  let service: DsmDepositAllocationAdapterService;

  const makeModuleData = (stakingModuleId: number) =>
    ({
      stakingModuleId,
    } as StakingModuleData);

  beforeEach(() => {
    stakingRouterService = {
      getDepositableEther: jest.fn(),
      getStakingModuleMaxDepositsCount: jest.fn(),
    };
    securityService = {
      version: jest.fn().mockResolvedValue(3),
    };

    service = new DsmDepositAllocationAdapterService(
      stakingRouterService as unknown as StakingRouterService,
      securityService as unknown as SecurityService,
    );
  });

  it('blocks DSM v3 module without allocation', async () => {
    stakingRouterService.getDepositableEther.mockResolvedValue(
      ethers.utils.parseEther('64'),
    );
    stakingRouterService.getStakingModuleMaxDepositsCount.mockResolvedValue(0);

    const isDepositBlockedByAllocation =
      await service.isDepositBlockedByAllocation(makeModuleData(1), BLOCK_HASH);

    expect(isDepositBlockedByAllocation).toBe(true);
    expect(securityService.version).toHaveBeenCalledWith({
      blockHash: BLOCK_HASH,
    });
    expect(stakingRouterService.getDepositableEther).toHaveBeenCalledWith({
      blockHash: BLOCK_HASH,
    });
    expect(
      stakingRouterService.getStakingModuleMaxDepositsCount,
    ).toHaveBeenCalledWith(1, ethers.utils.parseEther('64'), {
      blockHash: BLOCK_HASH,
    });
  });

  it('uses develop positive allocation predicate for DSM v3', async () => {
    stakingRouterService.getDepositableEther.mockResolvedValue(
      ethers.utils.parseEther('64'),
    );
    stakingRouterService.getStakingModuleMaxDepositsCount.mockResolvedValue(-1);

    const isDepositBlockedByAllocation =
      await service.isDepositBlockedByAllocation(makeModuleData(1), BLOCK_HASH);

    expect(isDepositBlockedByAllocation).toBe(true);
  });

  it('does not block DSM v3 module with allocation', async () => {
    stakingRouterService.getDepositableEther.mockResolvedValue(
      ethers.utils.parseEther('64'),
    );
    stakingRouterService.getStakingModuleMaxDepositsCount.mockResolvedValue(1);

    const isDepositBlockedByAllocation =
      await service.isDepositBlockedByAllocation(makeModuleData(1), BLOCK_HASH);

    expect(isDepositBlockedByAllocation).toBe(false);
  });

  it('uses one deposit as DSM v3 allocation check floor', async () => {
    stakingRouterService.getDepositableEther.mockResolvedValue(
      ethers.utils.parseEther('1'),
    );
    stakingRouterService.getStakingModuleMaxDepositsCount.mockResolvedValue(1);

    await service.isDepositBlockedByAllocation(makeModuleData(1), BLOCK_HASH);

    const [, allocationCheckValue] =
      stakingRouterService.getStakingModuleMaxDepositsCount.mock.calls[0];

    expect(allocationCheckValue.eq(ONE_DEPOSIT_VALUE)).toBe(true);
  });

  it('does not block DSM v4 module or call allocation methods', async () => {
    securityService.version.mockResolvedValue(4);
    stakingRouterService.getDepositableEther.mockRejectedValue(
      new Error('should not be called'),
    );
    stakingRouterService.getStakingModuleMaxDepositsCount.mockRejectedValue(
      new Error('should not be called'),
    );

    const isDepositBlockedByAllocation =
      await service.isDepositBlockedByAllocation(makeModuleData(1), BLOCK_HASH);

    expect(isDepositBlockedByAllocation).toBe(false);
    expect(stakingRouterService.getDepositableEther).not.toHaveBeenCalled();
    expect(
      stakingRouterService.getStakingModuleMaxDepositsCount,
    ).not.toHaveBeenCalled();
  });

  it('does not block DSM v5 module or call allocation methods', async () => {
    securityService.version.mockResolvedValue(5);
    stakingRouterService.getDepositableEther.mockRejectedValue(
      new Error('should not be called'),
    );
    stakingRouterService.getStakingModuleMaxDepositsCount.mockRejectedValue(
      new Error('should not be called'),
    );

    const isDepositBlockedByAllocation =
      await service.isDepositBlockedByAllocation(makeModuleData(1), BLOCK_HASH);

    expect(isDepositBlockedByAllocation).toBe(false);
    expect(stakingRouterService.getDepositableEther).not.toHaveBeenCalled();
    expect(
      stakingRouterService.getStakingModuleMaxDepositsCount,
    ).not.toHaveBeenCalled();
  });

  it('propagates DSM version validation from SecurityService without wrapping', async () => {
    const versionError = new Error('Unsupported DSM contract version found: 6');
    securityService.version.mockRejectedValue(versionError);

    await expect(
      service.isDepositBlockedByAllocation(makeModuleData(1), BLOCK_HASH),
    ).rejects.toBe(versionError);

    expect(stakingRouterService.getDepositableEther).not.toHaveBeenCalled();
    expect(
      stakingRouterService.getStakingModuleMaxDepositsCount,
    ).not.toHaveBeenCalled();
  });
});
