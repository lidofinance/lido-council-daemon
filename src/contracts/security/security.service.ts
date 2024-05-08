import { Signature } from '@ethersproject/bytes';
import { ContractReceipt } from '@ethersproject/contracts';
import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { METRIC_PAUSE_ATTEMPTS } from 'common/prometheus';
import { OneAtTime, StakingModuleId } from 'common/decorators';
import { SecurityAbi } from 'generated';
import { RepositoryService } from 'contracts/repository';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Counter } from 'prom-client';
import { BlockTag, ProviderService } from 'provider';
import { WalletService } from 'wallet';
import { ethers } from 'ethers';

@Injectable()
export class SecurityService {
  constructor(
    @InjectMetric(METRIC_PAUSE_ATTEMPTS) private pauseAttempts: Counter<string>,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private providerService: ProviderService,
    private repositoryService: RepositoryService,
    private walletService: WalletService,
  ) {}

  public async initialize(blockTag: BlockTag): Promise<void> {
    const guardianIndex = await this.getGuardianIndex(blockTag);
    const address = this.walletService.address;

    if (guardianIndex === -1) {
      this.logger.warn(`Your address is not in the Guardian List`, { address });
    } else {
      this.logger.log(`Your address is in the Guardian List`, { address });
    }
  }

  /**
   * Returns an instance of the contract that can send signed transactions
   */
  public async getContractWithSigner(): Promise<SecurityAbi> {
    const wallet = this.walletService.wallet;
    const provider = this.providerService.provider;
    const walletWithProvider = wallet.connect(provider);
    const contract = await this.repositoryService.getCachedDSMContract();
    const contractWithSigner = contract.connect(walletWithProvider);

    return contractWithSigner;
  }

  public async getContractV2WithSigner() {
    const oldAbi = [
      {
        inputs: [
          {
            internalType: 'uint256',
            name: 'blockNumber',
            type: 'uint256',
          },
          {
            internalType: 'uint256',
            name: 'stakingModuleId',
            type: 'uint256',
          },
          {
            components: [
              {
                internalType: 'bytes32',
                name: 'r',
                type: 'bytes32',
              },
              {
                internalType: 'bytes32',
                name: 'vs',
                type: 'bytes32',
              },
            ],
            internalType: 'struct DepositSecurityModule.Signature',
            name: 'sig',
            type: 'tuple',
          },
        ],
        name: 'pauseDeposits',
        outputs: [],
        stateMutability: 'nonpayable',
        type: 'function',
      },
    ];

    const contract = await this.repositoryService.getCachedDSMContract();

    const oldContract = new ethers.Contract(
      contract.address,
      oldAbi,
      this.providerService.provider,
    );

    const wallet = this.walletService.wallet;
    const provider = this.providerService.provider;
    const walletWithProvider = wallet.connect(provider);
    const contractWithSigner = oldContract.connect(walletWithProvider);

    return contractWithSigner;
  }

  /**
   * Returns the guardian list from the contract
   */
  public async getGuardians(blockTag?: BlockTag): Promise<string[]> {
    const contract = await this.repositoryService.getCachedDSMContract();
    const guardians = await contract.getGuardians({
      blockTag: blockTag as any,
    });

    return guardians;
  }

  /**
   * Returns the guardian index in the list
   */
  public async getGuardianIndex(blockTag?: BlockTag): Promise<number> {
    const guardians = await this.getGuardians(blockTag);
    const address = this.walletService.address;

    return guardians.indexOf(address);
  }

  /**
   * Returns guardian address
   */
  public getGuardianAddress(): string {
    return this.walletService.address;
  }

  /**
   * Signs a message to deposit buffered ethers with the prefix from the contract
   */
  public async signDepositData(
    depositRoot: string,
    keysOpIndex: number,
    blockNumber: number,
    blockHash: string,
    stakingModuleId: number,
  ): Promise<Signature> {
    const prefix = await this.repositoryService.getAttestMessagePrefix();

    return await this.walletService.signDepositData({
      prefix,
      depositRoot,
      keysOpIndex,
      blockNumber,
      blockHash,
      stakingModuleId,
    });
  }

  /**
   * Signs a message to pause deposit contract with the prefix from the contract
   */
  public async signPauseDataV3(blockNumber: number): Promise<Signature> {
    const prefix = await this.repositoryService.getPauseMessagePrefix();

    return await this.walletService.signPauseDataV3({
      prefix,
      blockNumber,
    });
  }

  /**
   * Sends a transaction to pause deposit contract
   * @param blockNumber - the block number for which the message is signed
   * @param signature - message signature
   */
  @OneAtTime()
  public async pauseDepositsV3(
    blockNumber: number,
    signature: Signature,
  ): Promise<ContractReceipt | void> {
    this.logger.warn('Try to pause deposits');
    this.pauseAttempts.inc();

    const contract = await this.getContractWithSigner();

    const { r, _vs: vs } = signature;
    const tx = await contract.pauseDeposits(blockNumber, {
      r,
      vs,
    });

    this.logger.warn('Pause transaction sent', { txHash: tx.hash });
    this.logger.warn('Waiting for block confirmation');

    await tx.wait();

    this.logger.warn('Block confirmation received');
  }

  /**
   * Signs a message to pause deposit contract with the prefix from the contract
   */
  public async signPauseDataV2(
    blockNumber: number,
    stakingModuleId: number,
  ): Promise<Signature> {
    const prefix = await this.repositoryService.getPauseMessagePrefix();

    return await this.walletService.signPauseDataV2({
      prefix,
      blockNumber,
      stakingModuleId,
    });
  }

  /**
   * Sends a transaction to pause deposits
   * @param blockNumber - the block number for which the message is signed
   * @param stakingModuleId - target staking module id
   * @param signature - message signature
   */
  @OneAtTime()
  public async pauseDepositsV2(
    blockNumber: number,
    @StakingModuleId stakingModuleId: number,
    signature: Signature,
  ): Promise<ContractReceipt | void> {
    this.logger.warn('Try to pause deposits');
    this.pauseAttempts.inc();

    const contract = await this.getContractV2WithSigner();

    const { r, _vs: vs } = signature;
    const tx = await contract.pauseDeposits(blockNumber, stakingModuleId, {
      r,
      vs,
    });

    this.logger.warn('Pause transaction sent', { txHash: tx.hash });
    this.logger.warn('Waiting for block confirmation');

    await tx.wait();

    this.logger.warn('Block confirmation received');
  }

  /**
   * Signs a message to deposit buffered ethers with the prefix from the contract
   */
  public async signUnvetData(
    nonce: number,
    blockNumber: number,
    blockHash: string,
    stakingModuleId: number,
    operatorIds: string,
    vettedKeysByOperator: string,
  ): Promise<Signature> {
    const prefix = await this.repositoryService.getUnvetMessagePrefix();

    return await this.walletService.signUnvetData({
      prefix,
      blockNumber,
      blockHash,
      stakingModuleId,
      nonce,
      operatorIds,
      vettedKeysByOperator,
    });
  }

  /**
   * Send transaction to unvet signing keys
   * @param nonce
   * @param blockNumber
   * @param blockHash
   * @param stakingModuleId
   * @param operatorIds
   * @param vettedKeysByOperator
   * @param signature
   */
  @OneAtTime()
  public async unvetSigningKeys(
    nonce: number,
    blockNumber: number,
    blockHash: string,
    @StakingModuleId stakingModuleId: number,
    operatorIds: string,
    vettedKeysByOperator: string,
    signature: Signature,
  ): Promise<ContractReceipt | void> {
    this.logger.warn('Try to unvet keys for staking module', {
      stakingModuleId,
      blockNumber,
    });

    const contract = await this.getContractWithSigner();

    const { r, _vs: vs } = signature;
    const tx = await contract.unvetSigningKeys(
      blockNumber,
      blockHash,
      stakingModuleId,
      nonce,
      operatorIds,
      vettedKeysByOperator,
      {
        r,
        vs,
      },
    );

    this.logger.warn('Unvet transaction sent', { txHash: tx.hash });
    this.logger.warn('Waiting for block confirmation');

    await tx.wait();

    this.logger.warn('Block confirmation received');
  }

  /**
   * Amount of operators in one unvetting transaction
   */
  public async getMaxOperatorsPerUnvetting(
    blockTag?: BlockTag,
  ): Promise<number> {
    const contract = await this.getContractWithSigner();

    const maxOperatorsPerUnvetting = await contract.getMaxOperatorsPerUnvetting(
      {
        blockTag: blockTag as any,
      },
    );

    return maxOperatorsPerUnvetting.toNumber();
  }

  public async version(blockTag?: BlockTag): Promise<number> {
    const contract = await this.getContractWithSigner();
    try {
      const version = await contract.VERSION({
        blockTag: blockTag as any,
      });
      return version.toNumber();
    } catch (error) {
      this.logger.error(
        'Error fetch version, possibly locator returned old version of DSM contract',
      );

      return 1;
    }
  }

  /**
   * Check if deposits paused
   */
  public async isDepositContractPaused(blockTag?: BlockTag) {
    const contract = await this.repositoryService.getCachedDSMContract();

    return contract.isDepositsPaused({ blockTag: blockTag as any });
  }

  /**
   * Returns the current state of deposits for module
   */
  public async isModuleDepositsPaused(
    stakingModuleId: number,
    blockTag?: BlockTag,
  ): Promise<boolean> {
    const stakingRouterContract =
      await this.repositoryService.getCachedStakingRouterContract();

    const isActive = await stakingRouterContract.getStakingModuleIsActive(
      stakingModuleId,
      {
        blockTag: blockTag as any,
      },
    );

    return !isActive;
  }
}
