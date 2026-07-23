import { ethers } from 'ethers';
import { GuardianService, BlockData, StakingModuleData } from 'guardian';
import { DsmDepositAllocationAdapterService } from 'guardian/deposit-allocation';
import { SecurityService } from 'contracts/security';
import { StakingRouterService } from 'contracts/staking-router';

const BLOCK_HASH = '0x' + '1'.repeat(64);
const DEPOSIT_ROOT = '0x' + '2'.repeat(64);
const GUARDIAN_ADDRESS = '0x' + '3'.repeat(40);

describe('DSM deposit allocation version e2e', () => {
  let guardianService: GuardianService;
  let stakingRouterService: jest.Mocked<
    Pick<
      StakingRouterService,
      'getDepositableEther' | 'getStakingModuleMaxDepositsCount'
    >
  >;
  let securityService: jest.Mocked<Pick<SecurityService, 'version'>>;
  let handleCorrectKeys: jest.Mock;
  let collectMetrics: jest.Mock;

  const makeModuleData = (stakingModuleId = 1): StakingModuleData => ({
    blockHash: BLOCK_HASH,
    vettedUnusedKeys: [],
    nonce: 1,
    stakingModuleId,
    stakingModuleAddress: GUARDIAN_ADDRESS,
    lastChangedBlockHash: BLOCK_HASH,
    duplicatedKeys: [],
    invalidKeys: [],
    crossTypeKeys: [],
    frontRunKeys: [],
    unresolvedDuplicatedKeys: [],
    withdrawalCredentials: '0x' + '0'.repeat(64),
    isModuleDepositsPaused: false,
  });

  const makeBlockData = (securityVersion: number): BlockData => ({
    blockNumber: 100,
    blockHash: BLOCK_HASH,
    depositRoot: DEPOSIT_ROOT,
    depositedEvents: { events: [] } as any,
    guardianContext: {
      dsmAddress: GUARDIAN_ADDRESS,
      dsmVersion: securityVersion as 3 | 4 | 5,
      delegateAddress: GUARDIAN_ADDRESS,
      guardianAddress: GUARDIAN_ADDRESS,
      guardianIndex: 0,
      mode: 'legacy-eoa',
    },
    guardianAddress: GUARDIAN_ADDRESS,
    guardianIndex: 0,
    securityVersion,
    alreadyPausedDeposits: false,
    hasFrontRunning: false,
    hasWrongWCType: false,
    walletBalanceCritical: false,
  });

  const handleDeposit = async (securityVersion: number) => {
    await (guardianService as any).handleDeposit(
      [makeModuleData()],
      makeBlockData(securityVersion),
    );
  };

  const handleDepositWithModules = async (
    modules: StakingModuleData[],
    securityVersion: number,
  ) => {
    await (guardianService as any).handleDeposit(
      modules,
      makeBlockData(securityVersion),
    );
  };

  beforeEach(() => {
    stakingRouterService = {
      getDepositableEther: jest.fn(),
      getStakingModuleMaxDepositsCount: jest.fn(),
    };
    securityService = {
      version: jest.fn(),
    };

    handleCorrectKeys = jest.fn().mockResolvedValue(undefined);
    collectMetrics = jest.fn();

    const depositAllocationAdapter = new DsmDepositAllocationAdapterService(
      stakingRouterService as unknown as StakingRouterService,
      securityService as unknown as SecurityService,
    );

    guardianService = new GuardianService(
      {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      securityService as unknown as SecurityService,
      {} as any,
      {} as any,
      { handleCorrectKeys } as any,
      {} as any,
      { collectMetrics } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      stakingRouterService as unknown as StakingRouterService,
      depositAllocationAdapter,
      {} as any,
    );
  });

  it('blocks deposits for DSM v3 module without allocation', async () => {
    securityService.version.mockResolvedValue(3);
    stakingRouterService.getDepositableEther.mockResolvedValue(
      ethers.utils.parseEther('32'),
    );
    stakingRouterService.getStakingModuleMaxDepositsCount.mockResolvedValue(0);

    await handleDeposit(4);

    expect(collectMetrics).toHaveBeenCalledTimes(1);
    expect(handleCorrectKeys).not.toHaveBeenCalled();
    expect(securityService.version).toHaveBeenCalledWith({
      blockHash: BLOCK_HASH,
    });
    expect(
      stakingRouterService.getStakingModuleMaxDepositsCount,
    ).toHaveBeenCalledTimes(1);
  });

  it('allows deposits for DSM v3 module with allocation', async () => {
    securityService.version.mockResolvedValue(3);
    stakingRouterService.getDepositableEther.mockResolvedValue(
      ethers.utils.parseEther('32'),
    );
    stakingRouterService.getStakingModuleMaxDepositsCount.mockResolvedValue(1);

    await handleDeposit(3);

    expect(collectMetrics).toHaveBeenCalledTimes(1);
    expect(handleCorrectKeys).toHaveBeenCalledTimes(1);
  });

  it('allows deposits for DSM v4 without calling allocation methods', async () => {
    securityService.version.mockResolvedValue(4);
    stakingRouterService.getDepositableEther.mockRejectedValue(
      new Error('should not be called'),
    );
    stakingRouterService.getStakingModuleMaxDepositsCount.mockRejectedValue(
      new Error('should not be called'),
    );

    await handleDeposit(3);

    expect(handleCorrectKeys).toHaveBeenCalledTimes(1);
    expect(stakingRouterService.getDepositableEther).not.toHaveBeenCalled();
    expect(
      stakingRouterService.getStakingModuleMaxDepositsCount,
    ).not.toHaveBeenCalled();
  });

  it('allows deposits for DSM v5 without calling allocation methods', async () => {
    securityService.version.mockResolvedValue(5);
    stakingRouterService.getDepositableEther.mockRejectedValue(
      new Error('should not be called'),
    );
    stakingRouterService.getStakingModuleMaxDepositsCount.mockRejectedValue(
      new Error('should not be called'),
    );

    await handleDeposit(5);

    expect(handleCorrectKeys).toHaveBeenCalledTimes(1);
    expect(stakingRouterService.getDepositableEther).not.toHaveBeenCalled();
    expect(
      stakingRouterService.getStakingModuleMaxDepositsCount,
    ).not.toHaveBeenCalled();
  });

  it('does not send partial deposits when DSM v3 allocation check fails', async () => {
    const allocationError = new Error('allocation rpc failed');
    securityService.version.mockResolvedValue(3);
    stakingRouterService.getDepositableEther.mockResolvedValue(
      ethers.utils.parseEther('32'),
    );
    stakingRouterService.getStakingModuleMaxDepositsCount.mockImplementation(
      async (stakingModuleId: number) => {
        if (stakingModuleId === 1) {
          throw allocationError;
        }

        return 1;
      },
    );

    await expect(
      handleDepositWithModules([makeModuleData(1), makeModuleData(2)], 3),
    ).rejects.toBe(allocationError);

    expect(handleCorrectKeys).not.toHaveBeenCalled();
  });
});
