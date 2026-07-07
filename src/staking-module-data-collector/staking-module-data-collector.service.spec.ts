import { Test } from '@nestjs/testing';
import { LoggerModule } from 'common/logger';
import { ConfigModule } from 'common/config';
import { MockProviderModule } from 'provider';
import { PrometheusModule } from 'common/prometheus';
import { RepositoryModule, RepositoryService } from 'contracts/repository';
import { StakingRouterService } from 'contracts/staking-router';
import { StakingModuleDataCollectorService } from './staking-module-data-collector.service';
import { StakingModuleDataCollectorModule } from './staking-module-data-collector.module';
import { LocatorService } from 'contracts/repository/locator/locator.service';
import { mockLocator } from 'contracts/repository/locator/locator.mock';
import { mockRepository } from 'contracts/repository/repository.mock';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { CHAINS } from '@lido-nestjs/constants';
import { getNetwork } from '@ethersproject/networks';
import { JsonRpcProvider } from '@ethersproject/providers';

jest.mock('../transport/stomp/stomp.client');

const mockMeta = {
  blockNumber: 100,
  blockHash: '0xabcdef',
  timestamp: 1000,
  lastChangedBlockHash: '0x123456',
};

const mockModule = {
  id: 1,
  nonce: 5,
  stakingModuleAddress: '0xmodule1',
};

describe('StakingModuleDataCollectorService', () => {
  let service: StakingModuleDataCollectorService;
  let stakingRouterService: StakingRouterService;
  let repositoryService: RepositoryService;
  let locatorService: LocatorService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        LoggerModule,
        PrometheusModule,
        RepositoryModule,
        StakingModuleDataCollectorModule,
      ],
    })
      .overrideProvider(SimpleFallbackJsonRpcBatchProvider)
      .useValue(new JsonRpcProvider('http://localhost:8545'))
      .compile();

    const provider = moduleRef.get(SimpleFallbackJsonRpcBatchProvider);
    jest
      .spyOn(provider, 'detectNetwork')
      .mockImplementation(async () => getNetwork(CHAINS.Mainnet));
    jest.spyOn(provider, 'getNetwork').mockImplementation(async () => ({
      chainId: CHAINS.Mainnet,
      name: 'mainnet',
    }));

    service = moduleRef.get(StakingModuleDataCollectorService);
    stakingRouterService = moduleRef.get(StakingRouterService);
    repositoryService = moduleRef.get(RepositoryService);
    locatorService = moduleRef.get(LocatorService);

    mockLocator(locatorService);
    await mockRepository(repositoryService);
  });

  describe('collectStakingModuleData', () => {
    it('should collect staking module data', async () => {
      jest
        .spyOn(stakingRouterService, 'isModuleDepositsPaused')
        .mockResolvedValue(false);

      const result = await service.collectStakingModuleData({
        stakingModules: [mockModule] as any,
        meta: mockMeta as any,
        lidoKeys: [],
        moduleWCMap: { '0xmodule1': '0xwc1' },
      });

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        stakingModuleId: mockModule.id,
        stakingModuleAddress: mockModule.stakingModuleAddress,
        nonce: mockModule.nonce,
        blockHash: mockMeta.blockHash,
        isModuleDepositsPaused: false,
        withdrawalCredentials: '0xwc1',
      });
    });

    it('buckets vetted-unused keys per module and assigns each module its own WC (0x01 vs 0x02)', async () => {
      jest
        .spyOn(stakingRouterService, 'isModuleDepositsPaused')
        .mockResolvedValue(false);

      const CURATED_ADDR = '0xmodule1';
      const CMV2_ADDR = '0x87EB69Ae51317405FD285efD2326a4a11f6173b9';
      const wc01 =
        '0x010000000000000000000000dc62f9e8c34be08501cdef4ebde0a280f576d762';
      const wc02 =
        '0x0200000000000000000000004473dcddbf77679a643bdb654dbd86d67f8d32f2';

      const mkKey = (over: any) => ({
        key: '0xk',
        depositSignature: '0xsig',
        operatorIndex: 0,
        used: false,
        vetted: true,
        index: 0,
        moduleAddress: CURATED_ADDR,
        ...over,
      });

      const curatedKey = mkKey({
        key: '0xcurated',
        moduleAddress: CURATED_ADDR,
      });
      const cmv2Key = mkKey({ key: '0xcmv2', moduleAddress: CMV2_ADDR });
      // must be excluded from vettedUnusedKeys
      const cmv2Used = mkKey({
        key: '0xused',
        moduleAddress: CMV2_ADDR,
        used: true,
      });
      const cmv2Unvetted = mkKey({
        key: '0xunvetted',
        moduleAddress: CMV2_ADDR,
        vetted: false,
      });

      const result = await service.collectStakingModuleData({
        stakingModules: [
          { id: 1, nonce: 5, stakingModuleAddress: CURATED_ADDR },
          { id: 5, nonce: 7, stakingModuleAddress: CMV2_ADDR },
        ] as any,
        meta: mockMeta as any,
        lidoKeys: [curatedKey, cmv2Key, cmv2Used, cmv2Unvetted],
        moduleWCMap: { [CURATED_ADDR]: wc01, [CMV2_ADDR]: wc02 },
      });

      const curated = result.find((m) => m.stakingModuleId === 1) as any;
      const cmv2 = result.find((m) => m.stakingModuleId === 5) as any;

      // each module gets its OWN withdrawal credentials
      expect(curated.withdrawalCredentials).toBe(wc01);
      expect(cmv2.withdrawalCredentials).toBe(wc02);

      // keys are bucketed by moduleAddress; only vetted-unused ones survive
      expect(curated.vettedUnusedKeys.map((k: any) => k.key)).toEqual([
        '0xcurated',
      ]);
      expect(cmv2.vettedUnusedKeys.map((k: any) => k.key)).toEqual(['0xcmv2']);
    });
  });
});
