import { Contract } from '@ethersproject/contracts';
import { curatedAbi } from './curated.abi';
import { EVM_SCRIPT_EXECUTOR } from './easy-tack';
import { accountImpersonate, setBalance, testSetupProvider } from './provider';

// TODO: remove after stop using
// use ADD_KEY_ACCOUNT_NODE_OP_ZERO for 0 nor op
const ADD_KEY_ACCOUNT = '0x6D725DAe055287f913661ee0b79dE6B21F12A459';

export const ADD_KEY_ACCOUNT_NODE_OP_ZERO = ADD_KEY_ACCOUNT;

export const ADD_KEY_ACCOUNT_NODE_OP_ONE =
  '0x39ceC2b3ba293CC15f15a3876dB8D356a1670789';

export const ADD_KEY_ACCOUNT_NODE_OP_ZERO_SDVT =
  '0x16FF967Cb189457a8A19Fae833DAE0e429742b00';

export class CuratedOnchainV1 {
  // short version of contract abi

  address: string;
  contract: Contract;

  constructor(address: string) {
    // initialize contract
    this.address = address;

    this.contract = new Contract(address, curatedAbi, testSetupProvider);
  }

  async getOperatorsCount(block: number): Promise<number> {
    return Number(
      await this.contract.getNodeOperatorsCount({ blockTag: block }),
    );
  }

  async addSigningKey(
    _nodeOperatorId: number,
    _keysCount: number,
    _publicKeys: string,
    _signatures: string,
    signer_account: string = ADD_KEY_ACCOUNT,
  ): Promise<void> {
    // 0 curated operator - ADD_KEY_ACCOUNT
    await accountImpersonate(signer_account);

    const impersonatedSigner = await testSetupProvider.getSigner(
      signer_account,
    );

    this.contract = new Contract(this.address, curatedAbi, impersonatedSigner);

    //impersonate account that can add node operator
    const tx = await this.contract.addSigningKeys(
      _nodeOperatorId,
      _keysCount,
      _publicKeys,
      _signatures,
    );

    // Wait for the transaction to be mined
    await tx.wait();
  }

  async setStakingLimit(
    _nodeOperatorId: number,
    _stakingLimit: number,
    signer_account: string = EVM_SCRIPT_EXECUTOR,
  ) {
    await accountImpersonate(signer_account);
    await setBalance(signer_account, 5);

    const impersonatedSigner = await testSetupProvider.getSigner(
      signer_account,
    );

    this.contract = new Contract(this.address, curatedAbi, impersonatedSigner);

    const tx = await this.contract.setNodeOperatorStakingLimit(
      _nodeOperatorId,
      _stakingLimit,
    );

    // Wait for the transaction to be mined
    await tx.wait();
  }

  async getOperator(nodeOperatorId: number, fullInfo: boolean) {
    this.contract = new Contract(this.address, curatedAbi, testSetupProvider);

    const operator = await this.contract.getNodeOperator(
      nodeOperatorId,
      fullInfo,
    );

    // Wait for the transaction to be mined
    return operator;
  }
}
