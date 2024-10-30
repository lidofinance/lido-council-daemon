import { Contract } from '@ethersproject/contracts';
import { curatedAbi } from './curated.abi';
import { EVM_SCRIPT_EXECUTOR } from './easy-tack';
import { accountImpersonate, setBalance, testSetupProvider } from './provider';

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
    signer_account: string,
  ): Promise<void> {
    //impersonate account that can add node operator
    await accountImpersonate(signer_account);
    await setBalance(signer_account, 100);

    const impersonatedSigner = await testSetupProvider.getSigner(
      signer_account,
    );

    this.contract = new Contract(this.address, curatedAbi, impersonatedSigner);

    const tx = await this.contract.addSigningKeys(
      _nodeOperatorId,
      _keysCount,
      _publicKeys,
      _signatures,
    );

    // Wait for the transaction to be mined
    await tx.wait();
  }

  async setStakingLimit(_nodeOperatorId: number, _stakingLimit: number) {
    const network = await testSetupProvider.getNetwork();
    const CHAIN_ID = network.chainId;

    const signer_account = EVM_SCRIPT_EXECUTOR[CHAIN_ID];

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

  async getActiveOperators() {
    this.contract = new Contract(this.address, curatedAbi, testSetupProvider);

    const count = Number(await this.contract.getNodeOperatorsCount());
    const activeOperators: any[] = [];

    for (let i = 0; i < count; i++) {
      const operator = await this.getOperator(i, false);
      if (operator.active) {
        activeOperators.push({ ...operator, index: i });
      }
    }

    return activeOperators;
  }
}
