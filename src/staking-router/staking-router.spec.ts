import { Test, TestingModule } from '@nestjs/testing';
import { KeysApiService } from '../keys-api/keys-api.service';
import { StakingRouterService } from './staking-router.service';
import { groupedByModulesOperators } from './operators.fixtures';
import { keysAllStakingModules } from './keys.fixtures';
import { ConfigModule } from 'common/config';
import { LoggerModule } from 'common/logger';
import { InconsistentLastChangedBlockHash } from 'common/custom-errors';

describe('StakingRouter', () => {
  let stakingRouterService: StakingRouterService;
  let keysApiService: KeysApiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot(), LoggerModule],
      providers: [
        StakingRouterService,
        {
          provide: KeysApiService,
          useValue: {
            getOperatorListWithModule: jest.fn(),
            getUnusedKeys: jest.fn(),
          },
        },
      ],
    }).compile();

    stakingRouterService =
      module.get<StakingRouterService>(StakingRouterService);
    keysApiService = module.get<KeysApiService>(KeysApiService);
  });

  it("should return correct data when 'lastChangedBlockHash' values of two requests are identical", async () => {
    (keysApiService.getUnusedKeys as jest.Mock).mockResolvedValue(
      keysAllStakingModules,
    );

    const result = await stakingRouterService.getStakingModulesData(
      groupedByModulesOperators,
    );

    // Assertions
    expect(result).toEqual([
      {
        unusedKeys: [
          '0x9948d2becf42e9f76922bc6f664545e6f50401050af95785a984802d32a95c4c61f8e3de312b78167f86e047f83a7796',
          '0x911dd3091cfb1b42c960e4f343ea98d9ee6a1dc8ef215afa976fb557bd627a901717c0008bc33a0bfea15f0dfe9c5d01',
          '0x8d12ec44816f108df84ef9b03e423a6d8fb0f0a1823c871b123ff41f893a7b372eb038a1ed1ff15083e07a777a5cba50',
        ],
        vettedUnusedKeys: [
          {
            key: '0x9948d2becf42e9f76922bc6f664545e6f50401050af95785a984802d32a95c4c61f8e3de312b78167f86e047f83a7796',
            depositSignature:
              '0x8bf4401a354de243a3716ee2efc0bde1ded56a40e2943ac7c50290bec37e935d6170b21e7c0872f203199386143ef12612a1488a8e9f1cdf1229c382f29c326bcbf6ed6a87d8fbfe0df87dacec6632fc4709d9d338f4cf81e861d942c23bba1e',
            operatorIndex: 0,
            used: false,
            moduleAddress: '0x595F64Ddc3856a3b5Ff4f4CC1d1fb4B46cFd2bAC',
            index: 100,
          },
        ],
        blockHash:
          '0x40c697def4d4f7233b75149ab941462582bb5f035b5089f7c6a3d7849222f47c',
        lastChangedBlockHash:
          '0x194ac4fd960ed44cb3db53fe1f5a53e983280fd438aeba607ae04f1bb416b4a1',
        stakingModuleId: 1,
        nonce: 364,
      },
      {
        unusedKeys: [
          '0x83fc58f68d913481e065c928b040ae8b157ef2b32371b7df93d40188077c619dc789d443c18ac4a9b7e76de5ed6c8247',
          '0x84e85db03bee714dbecf01914460d9576b7f7226030bdbeae9ee923bf5f8e01eec4f7dfe54aa7eca6f4bccce59a0bf42',
          '0x84ff489c1e07c75ac635914d4fa20bb37b30f7cf37a8fb85298a88e6f45daab122b43a352abce2132bdde96fd4a01599',
        ],
        vettedUnusedKeys: [
          {
            key: '0x83fc58f68d913481e065c928b040ae8b157ef2b32371b7df93d40188077c619dc789d443c18ac4a9b7e76de5ed6c8247',
            depositSignature:
              '0xa13833d96f4b98291dbf428cb69e7a3bdce61c9d20efcdb276423c7d6199ebd10cf1728dbd418c592701a41983cb02330e736610be254f617140af48a9d20b31cdffdd1d4fc8c0776439fca3330337d33042768acf897000b9e5da386077be44',
            operatorIndex: 28,
            used: false,
            moduleAddress: '0x11a93807078f8BB880c1BD0ee4C387537de4b4b6',
            index: 4,
          },
        ],
        nonce: 69,
        blockHash:
          '0x40c697def4d4f7233b75149ab941462582bb5f035b5089f7c6a3d7849222f47c',
        lastChangedBlockHash:
          '0x194ac4fd960ed44cb3db53fe1f5a53e983280fd438aeba607ae04f1bb416b4a1',
        stakingModuleId: 2,
      },
    ]);
  });

  it("should throw error when 'lastChangedBlockHash' values of two requests are different", async () => {
    (keysApiService.getUnusedKeys as jest.Mock).mockResolvedValue({
      ...keysAllStakingModules,
      ...{
        meta: {
          elBlockSnapshot: {
            lastChangedBlockHash:
              '0xabf3d64e85527d0c80eb6b0378316caceed9a24f535f6f28dad008fdfebe82b8',
          },
        },
      },
    });

    expect(
      stakingRouterService.getStakingModulesData(groupedByModulesOperators),
    ).rejects.toThrowError(new InconsistentLastChangedBlockHash());
  });
});
