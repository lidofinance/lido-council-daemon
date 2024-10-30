export const stakingRouterAbi = [
  {
    inputs: [],
    name: 'getStakingModules',
    outputs: [
      {
        components: [
          {
            internalType: 'uint24',
            name: 'id',
            type: 'uint24',
          },
          {
            internalType: 'address',
            name: 'stakingModuleAddress',
            type: 'address',
          },
          {
            internalType: 'uint16',
            name: 'stakingModuleFee',
            type: 'uint16',
          },
          {
            internalType: 'uint16',
            name: 'treasuryFee',
            type: 'uint16',
          },
          {
            internalType: 'uint16',
            name: 'targetShare',
            type: 'uint16',
          },
          {
            internalType: 'uint8',
            name: 'status',
            type: 'uint8',
          },
          {
            internalType: 'string',
            name: 'name',
            type: 'string',
          },
          {
            internalType: 'uint64',
            name: 'lastDepositAt',
            type: 'uint64',
          },
          {
            internalType: 'uint256',
            name: 'lastDepositBlock',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'exitedValidatorsCount',
            type: 'uint256',
          },
        ],
        internalType: 'struct StakingRouter.StakingModule[]',
        name: 'res',
        type: 'tuple[]',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];
