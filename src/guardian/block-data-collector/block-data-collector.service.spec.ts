import { BlockDataCollectorService } from './block-data-collector.service';
import { GuardianExecutionContext } from 'contracts/security';

describe('BlockDataCollectorService', () => {
  it('checks the balance after the guardian context selects the wallet', async () => {
    const legacyAddress = '0x0000000000000000000000000000000000000001';
    const delegateAddress = '0x0000000000000000000000000000000000000002';
    const context: GuardianExecutionContext = {
      dsmAddress: '0x0000000000000000000000000000000000000003',
      dsmVersion: 5,
      delegateAddress,
      guardianAddress: '0x0000000000000000000000000000000000000004',
      guardianIndex: 0,
      mode: 'edf',
    };
    let activeWalletAddress = legacyAddress;
    let balanceWalletAddress = '';

    const securityService = {
      getGuardianExecutionContext: jest.fn(async () => {
        await Promise.resolve();
        activeWalletAddress = delegateAddress;
        return context;
      }),
      isDepositsPaused: jest.fn().mockResolvedValue(false),
    };
    const walletService = {
      isBalanceCritical: jest.fn(async () => {
        balanceWalletAddress = activeWalletAddress;
        return false;
      }),
    };
    const service = new BlockDataCollectorService(
      {
        warn: jest.fn(),
        error: jest.fn(),
      } as any,
      { startTimer: jest.fn().mockReturnValue(jest.fn()) } as any,
      { inc: jest.fn() } as any,
      walletService as any,
      {
        getDepositRoot: jest.fn().mockResolvedValue('0xdeposit-root'),
        getAllDepositedEvents: jest.fn().mockResolvedValue([]),
      } as any,
      securityService as any,
      {
        checkHistoricalFrontRun: jest.fn().mockReturnValue(false),
        checkWrongWCType: jest.fn().mockReturnValue(false),
      } as any,
    );

    const blockData = await service.getCurrentBlockData({
      blockNumber: 1,
      blockHash: '0xblock-hash',
      moduleWCMap: {},
      lidoKeys: [],
    });

    expect(balanceWalletAddress).toBe(delegateAddress);
    expect(blockData.guardianContext).toBe(context);
  });
});
