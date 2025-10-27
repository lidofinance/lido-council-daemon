import { Signature } from '@ethersproject/bytes';
import { ContractReceipt } from '@ethersproject/contracts';
import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import {
  METRIC_PAUSE_ATTEMPTS,
  METRIC_UNVET_ATTEMPTS,
} from 'common/prometheus';
import { OneAtTime, OneAtTimeCallId } from 'common/decorators';
import { SecurityAbi } from 'generated';
import {
  SecurityDeprecatedPauseAbi,
  SecurityDeprecatedPauseAbi__factory,
} from 'generated';
import { RepositoryService } from 'contracts/repository';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Counter } from 'prom-client';
import { BlockTag, ProviderService } from 'provider';
import { WalletService } from 'wallet';
import { DSM_CONTRACT_SUPPORTED_VERSION } from './security.constants';

@Injectable()
export class SecurityService {
  constructor(
    @InjectMetric(METRIC_PAUSE_ATTEMPTS) private pauseAttempts: Counter<string>,
    @InjectMetric(METRIC_UNVET_ATTEMPTS) private unvetAttempts: Counter<string>,
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
  public getContractWithSigner(): SecurityAbi {
    const wallet = this.walletService.wallet;
    const provider = this.providerService.provider;
    const walletWithProvider = wallet.connect(provider);
    const contract = this.repositoryService.getCachedDSMContract();
    const contractWithSigner = contract.connect(walletWithProvider);

    return contractWithSigner;
  }

  /**
   * Returns an instance of the deprecated v2 security contract with only the `pause` method.
   */
  public getContractWithSignerDeprecated(): SecurityDeprecatedPauseAbi {
    const contract = this.repositoryService.getCachedDSMContract();

    const oldContract = SecurityDeprecatedPauseAbi__factory.connect(
      contract.address,
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
   *
   * @param depositRoot: Root of deposit contract
   * @param nonce - Current index of keys operations from the registry contract
   * @param blockNumber - The block number, included as part of the message for signing.
   * @param blockHash - The block hash, included as part of the message for signing and is used to fetch the pause prefix
   * @param stakingModuleId - The staking module ID, included as part of the message for signing.
   * @returns Signature for deposit.
   */
  public async signDepositData(
    depositRoot: string,
    nonce: number,
    blockNumber: number,
    blockHash: string,
    stakingModuleId: number,
  ): Promise<Signature> {
    const prefix = await this.getAttestMessagePrefix(blockHash);

    return await this.walletService.signDepositData({
      prefix,
      depositRoot,
      nonce,
      blockNumber,
      blockHash,
      stakingModuleId,
    });
  }

  /**
   * Signs a message to pause deposits, including the pause prefix from the contract.
   *
   * @param blockNumber - The block number, included as part of the message for signing.
   * @param blockHash - The block hash, used to fetch the pause prefix.
   * @returns Signature for pausing deposits.
   */
  public async signPauseDataV3(
    blockNumber: number,
    blockHash: string,
  ): Promise<Signature> {
    const prefix = await this.getPauseMessagePrefix(blockHash);

    return await this.walletService.signPauseDataV3({
      prefix,
      blockNumber,
    });
  }

  /**
   * Sends a transaction to pause deposits
   * @param blockNumber - the block number for which the message is signed
   * @param signature - message signature
   */
  @OneAtTime()
  public async pauseDepositsV3(
    pauseBlockNumber: number,
    signature: Signature,
  ): Promise<ContractReceipt> {
    this.logger.warn('Try to pause deposits', { pauseBlockNumber });
    this.pauseAttempts.inc();

    const contract = this.getContractWithSigner();

    const { r, _vs: vs } = signature;
    const tx = await contract.pauseDeposits(pauseBlockNumber, {
      r,
      vs,
    });

    this.logger.warn('Pause transaction sent', {
      txHash: tx.hash,
      pauseBlockNumber,
    });
    this.logger.warn('Waiting for block confirmation', { pauseBlockNumber });

    const receipt = await tx.wait();

    this.logger.warn('Block confirmation received for the pause tx', {
      pauseBlockNumber,
      txHash: tx.hash,
    });

    return receipt;
  }

  /**
   * Signs a message to pause deposits, including the pause prefix from the contract.
   *
   * @param blockNumber - The block number, included as part of the message for signing.
   * @param blockHash - The block hash, used to fetch the pause prefix.
   * @param stakingModuleId - The staking module ID, included as part of the message for signing.
   * @returns Signature for pausing deposits.
   */
  public async signPauseDataV2(
    blockNumber: number,
    blockHash: string,
    stakingModuleId: number,
  ): Promise<Signature> {
    const prefix = await this.getPauseMessagePrefix(blockHash);

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
    @OneAtTimeCallId stakingModuleId: number,
    signature: Signature,
  ): Promise<ContractReceipt> {
    this.logger.warn('Try to pause deposits', { stakingModuleId, blockNumber });
    this.pauseAttempts.inc();

    const contract = this.getContractWithSignerDeprecated();

    const { r, _vs: vs } = signature;
    const tx = await contract.pauseDeposits(blockNumber, stakingModuleId, {
      r,
      vs,
    });

    this.logger.warn('Pause transaction sent', {
      txHash: tx.hash,
      blockNumber,
      stakingModuleId,
    });
    this.logger.warn('Waiting for block confirmation', {
      blockNumber,
      stakingModuleId,
    });

    const receipt = await tx.wait();

    this.logger.warn('Block confirmation received', {
      blockNumber,
      stakingModuleId,
    });

    return receipt;
  }

  /**
   * Signs a message to unvet keys for a staking module.
   *
   * @param nonce - The nonce for the staking module.
   * @param blockNumber - The block number at which the message is signed.
   * @param blockHash - The hash of the block corresponding to the block number, used to fetch the pause prefix.
   * @param stakingModuleId - The ID of the target staking module.
   * @param operatorIds - A string containing the IDs of the operators whose keys are being unvetted.
   * @param vettedKeysByOperator - A string representing the new staking limit amount per operator.
   *
   * @returns A signature object containing the signed data.
   */
  public async signUnvetData(
    nonce: number,
    blockNumber: number,
    blockHash: string,
    stakingModuleId: number,
    operatorIds: string,
    vettedKeysByOperator: string,
  ): Promise<Signature> {
    const prefix = await this.getUnvetMessagePrefix(blockHash);

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
   * Sends a transaction to unvet signing keys for a staking module.
   *
   * @param nonce - The nonce for the staking module.
   * @param blockNumber - The block number at which the message is signed.
   * @param blockHash - The hash of the block corresponding to the block number.
   * @param stakingModuleId - The ID of the target staking module.
   * @param operatorIds - A string containing the IDs of the operators whose keys are being unvetted.
   * @param vettedKeysByOperator - A string representing the new staking limit amount per operator.
   * @param signature - The signature of the message, containing `r` and `_vs`.
   *
   * @returns The transaction receipt or `void` if the transaction fails.
   */
  @OneAtTime()
  public async unvetSigningKeys(
    nonce: number,
    blockNumber: number,
    blockHash: string,
    @OneAtTimeCallId stakingModuleId: number,
    operatorIds: string,
    vettedKeysByOperator: string,
    signature: Signature,
  ): Promise<ContractReceipt> {
    this.logger.warn('Try to unvet keys for staking module', {
      stakingModuleId,
      blockNumber,
    });
    this.unvetAttempts.inc();

    const contract = this.getContractWithSigner();

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

    this.logger.warn('Unvet transaction sent', {
      txHash: tx.hash,
      blockNumber,
      stakingModuleId,
    });
    this.logger.warn('Waiting for block confirmation', {
      blockNumber,
      stakingModuleId,
    });

    const receipt = await tx.wait();

    this.logger.warn('Block confirmation received', {
      blockNumber,
      stakingModuleId,
    });

    return receipt;
  }

  /**
   * Return the maximum number of operators in one unvetting transaction
   */
  public async getMaxOperatorsPerUnvetting(
    blockTag?: BlockTag,
  ): Promise<number> {
    const contract = this.getContractWithSigner();

    const maxOperatorsPerUnvetting = await contract.getMaxOperatorsPerUnvetting(
      {
        blockTag: blockTag as any,
      },
    );

    return maxOperatorsPerUnvetting.toNumber();
  }

  public async version(blockTag?: BlockTag): Promise<number> {
    const contract = this.getContractWithSigner();
    const version = await contract.VERSION({
      blockTag: blockTag as any,
    });

    const currentVersion = version.toNumber();

    if (currentVersion !== DSM_CONTRACT_SUPPORTED_VERSION) {
      this.logger.warn(`Deprecated DSM contract version found: ${version}`, {
        dsmContractAddress: contract.address,
        blockTag,
      });
      throw new Error(`Deprecated DSM contract version found: ${version}`);
    }
    return currentVersion;
  }

  /**
   * Check if deposits paused
   */
  public async isDepositsPaused(blockTag?: BlockTag) {
    const contract = await this.repositoryService.getCachedDSMContract();

    return contract.isDepositsPaused({ blockTag: blockTag as any });
  }

  /**
   * Returns a prefix from the contract with which the deposit message should be signed
   */
  public async getAttestMessagePrefix(blockHash: string): Promise<string> {
    const contract = await this.repositoryService.getCachedDSMContract();
    return await contract.ATTEST_MESSAGE_PREFIX({
      blockTag: { blockHash } as any,
    });
  }

  /**
   * Returns a prefix from the contract with which the pause message should be signed
   */
  public async getPauseMessagePrefix(blockHash: string): Promise<string> {
    const contract = await this.repositoryService.getCachedDSMContract();
    return await contract.PAUSE_MESSAGE_PREFIX({
      blockTag: { blockHash } as any,
    });
  }

  /**
   * Returns a prefix from the contract with which the pause message should be signed
   */
  public async getUnvetMessagePrefix(blockHash: string): Promise<string> {
    const contract = await this.repositoryService.getCachedDSMContract();
    return await contract.UNVET_MESSAGE_PREFIX({
      blockTag: { blockHash } as any,
    });
  }
}
