import { GroupedByModuleOperatorListResponse } from 'keys-api/interfaces/GroupedByModuleOperatorListResponse';

export const groupedByModulesOperators: GroupedByModuleOperatorListResponse = {
  data: [
    {
      operators: [
        {
          name: 'Dev team',
          rewardAddress: '0x6D725DAe055287f913661ee0b79dE6B21F12A459',
          stakingLimit: 101,
          stoppedValidators: 0,
          totalSigningKeys: 103,
          usedSigningKeys: 100,
          index: 0,
          active: true,
          moduleAddress: '0x595F64Ddc3856a3b5Ff4f4CC1d1fb4B46cFd2bAC',
        },
        {
          name: 'DSRV',
          rewardAddress: '0x39ceC2b3ba293CC15f15a3876dB8D356a1670789',
          stakingLimit: 2,
          stoppedValidators: 0,
          totalSigningKeys: 2,
          usedSigningKeys: 2,
          index: 1,
          active: true,
          moduleAddress: '0x595F64Ddc3856a3b5Ff4f4CC1d1fb4B46cFd2bAC',
        },
      ],
      module: {
        nonce: 364,
        type: 'curated-onchain-v1',
        id: 1,
        stakingModuleAddress: '0x595F64Ddc3856a3b5Ff4f4CC1d1fb4B46cFd2bAC',
        moduleFee: 500,
        treasuryFee: 500,
        targetShare: 10000,
        status: 0,
        name: 'curated-onchain-v1',
        lastDepositAt: 1700841084,
        lastDepositBlock: 385525,
        exitedValidatorsCount: 2,
        active: true,
        lastChangedBlockHash:
          '0x194ac4fd960ed44cb3db53fe1f5a53e983280fd438aeba607ae04f1bb416b4a1',
      },
    },
    {
      operators: [
        {
          name: 'Lido x Obol: Delightful Dragonfly',
          rewardAddress: '0x142E4542865a638208c17fF288cdA8cC82ecD27a',
          stakingLimit: 5,
          stoppedValidators: 0,
          totalSigningKeys: 7,
          usedSigningKeys: 4,
          index: 28,
          active: true,
          moduleAddress: '0x11a93807078f8BB880c1BD0ee4C387537de4b4b6',
        },
      ],
      module: {
        nonce: 69,
        type: 'curated-onchain-v1',
        id: 2,
        stakingModuleAddress: '0x11a93807078f8BB880c1BD0ee4C387537de4b4b6',
        moduleFee: 800,
        treasuryFee: 200,
        targetShare: 500,
        status: 0,
        name: 'SimpleDVT',
        lastDepositAt: 1700764452,
        lastDepositBlock: 379465,
        exitedValidatorsCount: 0,
        active: true,
        lastChangedBlockHash:
          '0x194ac4fd960ed44cb3db53fe1f5a53e983280fd438aeba607ae04f1bb416b4a1',
      },
    },
  ],
  meta: {
    elBlockSnapshot: {
      blockNumber: 400153,
      blockHash:
        '0x40c697def4d4f7233b75149ab941462582bb5f035b5089f7c6a3d7849222f47c',
      timestamp: 1701027516,
      lastChangedBlockHash:
        '0x194ac4fd960ed44cb3db53fe1f5a53e983280fd438aeba607ae04f1bb416b4a1',
    },
  },
};
