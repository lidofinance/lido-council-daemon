export const vettedKeys = [
  {
    key: '0x911dd3091cfb1b42c960e4f343ea98d9ee6a1dc8ef215afa976fb557bd627a901717c0008bc33a0bfea15f0dfe9c5d01',
    depositSignature:
      '0x898ac7072aa26d983f9ece384c4037966dde614b75dddf982f6a415f3107cb2569b96f6d1c44e608a250ac4bbe908df51473f0de2cf732d283b07d88f3786893124967b8697a8b93d31976e7ac49ab1e568f98db0bbb13384477e8357b6d7e9b',
    operatorIndex: 0,
    used: false,
    moduleAddress: '0x595F64Ddc3856a3b5Ff4f4CC1d1fb4B46cFd2bAC',
    index: 101,
  },
];

export const vettedKeysDuplicatesAcrossModules: any = [
  {
    stakingModuleId: 100,
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
      {
        key: '0x911dd3091cfb1b42c960e4f343ea98d9ee6a1dc8ef215afa976fb557bd627a901717c0008bc33a0bfea15f0dfe9c5d01',
        depositSignature:
          '0x898ac7072aa26d983f9ece384c4037966dde614b75dddf982f6a415f3107cb2569b96f6d1c44e608a250ac4bbe908df51473f0de2cf732d283b07d88f3786893124967b8697a8b93d31976e7ac49ab1e568f98db0bbb13384477e8357b6d7e9b',
        operatorIndex: 0,
        used: false,
        moduleAddress: '0x595F64Ddc3856a3b5Ff4f4CC1d1fb4B46cFd2bAC',
        index: 101,
      },
    ],
  },
  {
    stakingModuleId: 102,
    vettedUnusedKeys: [
      {
        key: '0x911dd3091cfb1b42c960e4f343ea98d9ee6a1dc8ef215afa976fb557bd627a901717c0008bc33a0bfea15f0dfe9c5d01',
        depositSignature:
          '0xa13833d96f4b98291dbf428cb69e7a3bdce61c9d20efcdb276423c7d6199ebd10cf1728dbd418c592701a41983cb02330e736610be254f617140af48a9d20b31cdffdd1d4fc8c0776439fca3330337d33042768acf897000b9e5da386077be44',
        operatorIndex: 28,
        used: false,
        moduleAddress: '0x11a93807078f8BB880c1BD0ee4C387537de4b4b6',
        index: 4,
      },
      {
        key: '0x84e85db03bee714dbecf01914460d9576b7f7226030bdbeae9ee923bf5f8e01eec4f7dfe54aa7eca6f4bccce59a0bf42',
        depositSignature:
          '0xb024b67a2f6c579213529e143bd4ebb81c5a2dc385cb526de4a816c8fe0317ebfb38369b08622e9f27e62cce2811679a13a459d4e9a8d7bd00080c36b359c1ca03bdcf4a0fcbbc2e18fe9923d8c4edb503ade58bdefe690760611e3738d5e64f',
        operatorIndex: 28,
        used: false,
        moduleAddress: '0x11a93807078f8BB880c1BD0ee4C387537de4b4b6',
        index: 5,
      },
    ],
  },
  {
    stakingModuleId: 103,
    vettedUnusedKeys: [
      {
        key: '0x84ff489c1e07c75ac635914d4fa20bb37b30f7cf37a8fb85298a88e6f45daab122b43a352abce2132bdde96fd4a01599',
        depositSignature:
          '0xb024b67a2f6c579213529e143bd4ebb81c5a2dc385cb526de4a816c8fe0317ebfb38369b08622e9f27e62cce2811679a13a459d4e9a8d7bd00080c36b359c1ca03bdcf4a0fcbbc2e18fe9923d8c4edb503ade58bdefe690760611e3738d5e64f',
        operatorIndex: 28,
        used: false,
        moduleAddress: 'another_module',
        index: 5,
      },
    ],
  },
];

export const vettedKeysDuplicatesAcrossOneModule: any = [
  {
    stakingModuleId: 100,
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
      {
        key: '0x911dd3091cfb1b42c960e4f343ea98d9ee6a1dc8ef215afa976fb557bd627a901717c0008bc33a0bfea15f0dfe9c5d01',
        depositSignature:
          '0x898ac7072aa26d983f9ece384c4037966dde614b75dddf982f6a415f3107cb2569b96f6d1c44e608a250ac4bbe908df51473f0de2cf732d283b07d88f3786893124967b8697a8b93d31976e7ac49ab1e568f98db0bbb13384477e8357b6d7e9b',
        operatorIndex: 0,
        used: false,
        moduleAddress: '0x595F64Ddc3856a3b5Ff4f4CC1d1fb4B46cFd2bAC',
        index: 101,
      },
      {
        key: '0x9948d2becf42e9f76922bc6f664545e6f50401050af95785a984802d32a95c4c61f8e3de312b78167f86e047f83a7796',
        depositSignature:
          '0x8bf4401a354de243a3716ee2efc0bde1ded56a40e2943ac7c50290bec37e935d6170b21e7c0872f203199386143ef12612a1488a8e9f1cdf1229c382f29c326bcbf6ed6a87d8fbfe0df87dacec6632fc4709d9d338f4cf81e861d942c23bba1e',
        operatorIndex: 0,
        used: false,
        moduleAddress: '0x595F64Ddc3856a3b5Ff4f4CC1d1fb4B46cFd2bAC',
        index: 102,
      },
    ],
  },
  {
    stakingModuleId: 102,
    vettedUnusedKeys: [
      {
        key: '0x84e85db03bee714dbecf01914460d9576b7f7226030bdbeae9ee923bf5f8e01eec4f7dfe54aa7eca6f4bccce59a0bf42',
        depositSignature:
          '0xb024b67a2f6c579213529e143bd4ebb81c5a2dc385cb526de4a816c8fe0317ebfb38369b08622e9f27e62cce2811679a13a459d4e9a8d7bd00080c36b359c1ca03bdcf4a0fcbbc2e18fe9923d8c4edb503ade58bdefe690760611e3738d5e64f',
        operatorIndex: 28,
        used: false,
        moduleAddress: '0x11a93807078f8BB880c1BD0ee4C387537de4b4b6',
        index: 5,
      },
    ],
  },

  {
    stakingModuleId: 103,
    vettedUnusedKeys: [
      {
        key: '0x84ff489c1e07c75ac635914d4fa20bb37b30f7cf37a8fb85298a88e6f45daab122b43a352abce2132bdde96fd4a01599',
        depositSignature:
          '0xb024b67a2f6c579213529e143bd4ebb81c5a2dc385cb526de4a816c8fe0317ebfb38369b08622e9f27e62cce2811679a13a459d4e9a8d7bd00080c36b359c1ca03bdcf4a0fcbbc2e18fe9923d8c4edb503ade58bdefe690760611e3738d5e64f',
        operatorIndex: 28,
        used: false,
        moduleAddress: 'another_module',
        index: 5,
      },
    ],
  },
];

export const vettedKeysDuplicatesAcrossOneModuleAndFew: any = [
  {
    stakingModuleId: 100,
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
      {
        key: '0x911dd3091cfb1b42c960e4f343ea98d9ee6a1dc8ef215afa976fb557bd627a901717c0008bc33a0bfea15f0dfe9c5d01',
        depositSignature:
          '0x898ac7072aa26d983f9ece384c4037966dde614b75dddf982f6a415f3107cb2569b96f6d1c44e608a250ac4bbe908df51473f0de2cf732d283b07d88f3786893124967b8697a8b93d31976e7ac49ab1e568f98db0bbb13384477e8357b6d7e9b',
        operatorIndex: 0,
        used: false,
        moduleAddress: '0x595F64Ddc3856a3b5Ff4f4CC1d1fb4B46cFd2bAC',
        index: 101,
      },
    ],
  },
  {
    stakingModuleId: 102,
    vettedUnusedKeys: [
      {
        key: '0x911dd3091cfb1b42c960e4f343ea98d9ee6a1dc8ef215afa976fb557bd627a901717c0008bc33a0bfea15f0dfe9c5d01',
        depositSignature:
          '0xa13833d96f4b98291dbf428cb69e7a3bdce61c9d20efcdb276423c7d6199ebd10cf1728dbd418c592701a41983cb02330e736610be254f617140af48a9d20b31cdffdd1d4fc8c0776439fca3330337d33042768acf897000b9e5da386077be44',
        operatorIndex: 28,
        used: false,
        moduleAddress: '0x11a93807078f8BB880c1BD0ee4C387537de4b4b6',
        index: 4,
      },
      {
        key: '0x84e85db03bee714dbecf01914460d9576b7f7226030bdbeae9ee923bf5f8e01eec4f7dfe54aa7eca6f4bccce59a0bf42',
        depositSignature:
          '0xb024b67a2f6c579213529e143bd4ebb81c5a2dc385cb526de4a816c8fe0317ebfb38369b08622e9f27e62cce2811679a13a459d4e9a8d7bd00080c36b359c1ca03bdcf4a0fcbbc2e18fe9923d8c4edb503ade58bdefe690760611e3738d5e64f',
        operatorIndex: 28,
        used: false,
        moduleAddress: '0x11a93807078f8BB880c1BD0ee4C387537de4b4b6',
        index: 5,
      },
      {
        key: '0x911dd3091cfb1b42c960e4f343ea98d9ee6a1dc8ef215afa976fb557bd627a901717c0008bc33a0bfea15f0dfe9c5d01',
        depositSignature:
          '0xa13833d96f4b98291dbf428cb69e7a3bdce61c9d20efcdb276423c7d6199ebd10cf1728dbd418c592701a41983cb02330e736610be254f617140af48a9d20b31cdffdd1d4fc8c0776439fca3330337d33042768acf897000b9e5da386077be44',
        operatorIndex: 28,
        used: false,
        moduleAddress: '0x11a93807078f8BB880c1BD0ee4C387537de4b4b6',
        index: 6,
      },
    ],
  },
  {
    stakingModuleId: 103,
    vettedUnusedKeys: [
      {
        key: '0x84ff489c1e07c75ac635914d4fa20bb37b30f7cf37a8fb85298a88e6f45daab122b43a352abce2132bdde96fd4a01599',
        depositSignature:
          '0xb024b67a2f6c579213529e143bd4ebb81c5a2dc385cb526de4a816c8fe0317ebfb38369b08622e9f27e62cce2811679a13a459d4e9a8d7bd00080c36b359c1ca03bdcf4a0fcbbc2e18fe9923d8c4edb503ade58bdefe690760611e3738d5e64f',
        operatorIndex: 28,
        used: false,
        moduleAddress: 'another_module',
        index: 5,
      },
    ],
  },
];

export const vettedKeysWithoutDuplicates: any = [
  {
    stakingModuleId: 100,
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
      {
        key: '0x911dd3091cfb1b42c960e4f343ea98d9ee6a1dc8ef215afa976fb557bd627a901717c0008bc33a0bfea15f0dfe9c5d01',
        depositSignature:
          '0x898ac7072aa26d983f9ece384c4037966dde614b75dddf982f6a415f3107cb2569b96f6d1c44e608a250ac4bbe908df51473f0de2cf732d283b07d88f3786893124967b8697a8b93d31976e7ac49ab1e568f98db0bbb13384477e8357b6d7e9b',
        operatorIndex: 0,
        used: false,
        moduleAddress: '0x595F64Ddc3856a3b5Ff4f4CC1d1fb4B46cFd2bAC',
        index: 101,
      },
    ],
  },

  {
    stakingModuleId: 102,
    vettedUnusedKeys: [
      {
        key: '0x84e85db03bee714dbecf01914460d9576b7f7226030bdbeae9ee923bf5f8e01eec4f7dfe54aa7eca6f4bccce59a0bf42',
        depositSignature:
          '0xb024b67a2f6c579213529e143bd4ebb81c5a2dc385cb526de4a816c8fe0317ebfb38369b08622e9f27e62cce2811679a13a459d4e9a8d7bd00080c36b359c1ca03bdcf4a0fcbbc2e18fe9923d8c4edb503ade58bdefe690760611e3738d5e64f',
        operatorIndex: 28,
        used: false,
        moduleAddress: '0x11a93807078f8BB880c1BD0ee4C387537de4b4b6',
        index: 5,
      },
    ],
  },

  {
    stakingModuleId: 103,
    vettedUnusedKeys: [
      {
        key: '0x84ff489c1e07c75ac635914d4fa20bb37b30f7cf37a8fb85298a88e6f45daab122b43a352abce2132bdde96fd4a01599',
        depositSignature:
          '0xb024b67a2f6c579213529e143bd4ebb81c5a2dc385cb526de4a816c8fe0317ebfb38369b08622e9f27e62cce2811679a13a459d4e9a8d7bd00080c36b359c1ca03bdcf4a0fcbbc2e18fe9923d8c4edb503ade58bdefe690760611e3738d5e64f',
        operatorIndex: 28,
        used: false,
        moduleAddress: 'another_module',
        index: 5,
      },
    ],
  },
];
