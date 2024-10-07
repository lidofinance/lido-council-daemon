import { Contract } from '@ethersproject/contracts';
import { testSetupProvider } from './provider';

export class CuratedOnchainV1 {
  // short version of contract abi
  abi = [
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
  ];

  address: string;
  contract: Contract;

  constructor(address: string) {
    // initialize contract
    this.address = address;
    this.contract = new Contract(address, this.abi, testSetupProvider);
  }

  async getOperatorsCount(block: number): Promise<number> {
    return Number(
      await this.contract.getNodeOperatorsCount({ blockTag: block }),
    );
  }

  async addSigningKey(
    block: number,
    _nodeOperatorId: number,
    _keysCount: number,
    _publicKeys: string, // Should be passed as a bytes-like string
    _signatures: string, // Should be passed as a bytes-like string
  ): Promise<void> {
    const tx = await this.contract.addSigningKeys(
      _nodeOperatorId,
      _keysCount,
      _publicKeys,
      _signatures,
      {
        blockTag: block,
      },
    );

    // Wait for the transaction to be mined
    await tx.wait();
  }
}
