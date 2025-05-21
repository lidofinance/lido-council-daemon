export const curatedAbi = [
  {
    constant: false,
    inputs: [
      {
        name: '_nodeOperatorId',
        type: 'uint256',
      },
      {
        name: '_keysCount',
        type: 'uint256',
      },
      {
        name: '_publicKeys',
        type: 'bytes',
      },
      {
        name: '_signatures',
        type: 'bytes',
      },
    ],
    name: 'addSigningKeys',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    constant: true,
    inputs: [],
    name: 'getNodeOperatorsCount',
    outputs: [
      {
        name: '',
        type: 'uint256',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
  {
    constant: false,
    inputs: [
      {
        name: '_nodeOperatorId',
        type: 'uint256',
      },
      {
        name: '_vettedSigningKeysCount',
        type: 'uint64',
      },
    ],
    name: 'setNodeOperatorStakingLimit',
    outputs: [],
    payable: false,
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Adding getNodeOperator function
  {
    constant: true,
    inputs: [
      {
        name: '_nodeOperatorId',
        type: 'uint256',
      },
      {
        name: '_fullInfo',
        type: 'bool',
      },
    ],
    name: 'getNodeOperator',
    outputs: [
      {
        name: 'active',
        type: 'bool',
      },
      {
        name: 'name',
        type: 'string',
      },
      {
        name: 'rewardAddress',
        type: 'address',
      },
      {
        name: 'totalVettedValidators',
        type: 'uint64',
      },
      {
        name: 'totalExitedValidators',
        type: 'uint64',
      },
      {
        name: 'totalAddedValidators',
        type: 'uint64',
      },
      {
        name: 'totalDepositedValidators',
        type: 'uint64',
      },
    ],
    payable: false,
    stateMutability: 'view',
    type: 'function',
  },
];
