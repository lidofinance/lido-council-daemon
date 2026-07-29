import { Signature } from '@ethersproject/bytes';
import { ContractReceipt } from '@ethersproject/contracts';
import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import {
  METRIC_PAUSE_ATTEMPTS,
  METRIC_UNVET_ATTEMPTS,
} from 'common/prometheus';
import { OneAtTime, OneAtTimeCallId } from 'common/decorators';
import { Configuration } from 'common/config';
import {
  DelegationContractAbi,
  DelegationContractAbi__factory,
  SecurityAbi,
  SecurityV5Abi__factory,
} from 'generated';
import {
  SecurityDeprecatedPauseAbi,
  SecurityDeprecatedPauseAbi__factory,
} from 'generated';
import { RepositoryService } from 'contracts/repository';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Counter } from 'prom-client';
import { BlockTag } from '@lido-nestjs/execution';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { WalletService } from 'wallet';
import {
  DSM_CONTRACT_SUPPORTED_VERSIONS,
  DSM_CONTRACT_VERSION_5,
  ERC1271_INTERFACE_ID,
} from './security.constants';
import { constants, utils } from 'ethers';

export type DsmVersion = 3 | 4 | 5;

export interface GuardianExecutionContext {
  dsmAddress: string;
  dsmVersion: DsmVersion;
  delegateAddress: string;
  guardianAddress: string;
  guardianIndex: number;
  mode: 'legacy-eoa' | 'edf';
}

@Injectable()
export class SecurityService {
  constructor(
    @InjectMetric(METRIC_PAUSE_ATTEMPTS) private pauseAttempts: Counter<string>,
    @InjectMetric(METRIC_UNVET_ATTEMPTS) private unvetAttempts: Counter<string>,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private provider: SimpleFallbackJsonRpcBatchProvider,
    private repositoryService: RepositoryService,
    private walletService: WalletService,
    private config: Configuration,
  ) {}

  public async initialize(blockTag: BlockTag): Promise<void> {
    const context = await this.getGuardianExecutionContext(blockTag);
    const address = context.guardianAddress;

    if (context.guardianIndex === -1) {
      this.logger.warn(`Your address is not in the Guardian List`, { address });
    } else {
      this.logger.log(`Your address is in the Guardian List`, { address });
    }
  }

  public async getGuardianExecutionContext(
    blockTag: BlockTag,
  ): Promise<GuardianExecutionContext> {
    const contract = this.repositoryService.getCachedDSMContract();
    const dsmAddress = utils.getAddress(contract.address);
    const dsmVersion = (await this.version(blockTag)) as DsmVersion;

    if (dsmVersion !== DSM_CONTRACT_VERSION_5) {
      this.walletService.selectLegacyWallet();
      const delegateAddress = utils.getAddress(this.walletService.address);
      const guardians = await this.getGuardians(blockTag);
      return {
        dsmAddress,
        dsmVersion,
        delegateAddress,
        guardianAddress: delegateAddress,
        guardianIndex: this.findGuardianIndex(guardians, delegateAddress),
        mode: 'legacy-eoa',
      };
    }

    const configuredAddress = this.config.DELEGATION_CONTRACT_ADDRESS;
    if (!configuredAddress || !utils.isAddress(configuredAddress)) {
      throw new Error(
        'DELEGATION_CONTRACT_ADDRESS is required for DSM version 5',
      );
    }

    const guardianAddress = utils.getAddress(configuredAddress);
    if ((await this.provider.getCode(guardianAddress, blockTag)) === '0x') {
      throw new Error(
        `No contract code at DELEGATION_CONTRACT_ADDRESS ${guardianAddress}`,
      );
    }

    const delegationContract = DelegationContractAbi__factory.connect(
      guardianAddress,
      this.provider,
    );
    const overrides = { blockTag: blockTag as any };
    const [effectiveDelegate, terminated, supportsErc1271, guardians] =
      await Promise.all([
        delegationContract.getDelegate(overrides),
        delegationContract.isTerminated(overrides),
        delegationContract.supportsInterface(ERC1271_INTERFACE_ID, overrides),
        this.getGuardians(blockTag),
      ]);

    if (terminated) {
      throw new Error(`DelegationContract ${guardianAddress} is terminated`);
    }
    if (effectiveDelegate === constants.AddressZero) {
      throw new Error(
        `DelegationContract ${guardianAddress} has no active delegate`,
      );
    }
    const delegateAddress = utils.getAddress(effectiveDelegate);
    if (!supportsErc1271) {
      throw new Error(
        `DelegationContract ${guardianAddress} does not support ERC-1271`,
      );
    }

    const guardianIndex = this.findGuardianIndex(guardians, guardianAddress);
    if (guardianIndex === -1) {
      throw new Error(
        `DelegationContract ${guardianAddress} is not a DSM guardian`,
      );
    }

    this.walletService.selectDelegateWallet(delegateAddress);

    return {
      dsmAddress,
      dsmVersion,
      delegateAddress,
      guardianAddress,
      guardianIndex,
      mode: 'edf',
    };
  }

  private findGuardianIndex(
    guardians: string[],
    guardianAddress: string,
  ): number {
    return guardians.findIndex(
      (guardian) => guardian.toLowerCase() === guardianAddress.toLowerCase(),
    );
  }

  /**
   * Returns an instance of the contract that can send signed transactions
   */
  public getContractWithSigner(): SecurityAbi {
    const wallet = this.walletService.wallet;
    const walletWithProvider = wallet.connect(this.provider);
    const contract = this.repositoryService.getCachedDSMContract();
    const contractWithSigner = contract.connect(walletWithProvider);

    return contractWithSigner;
  }

  public getDelegationContractWithSigner(
    context: GuardianExecutionContext,
  ): DelegationContractAbi {
    this.selectWallet(context);
    const walletWithProvider = this.walletService.wallet.connect(this.provider);
    return DelegationContractAbi__factory.connect(
      context.guardianAddress,
      walletWithProvider,
    );
  }

  /**
   * Returns an instance of the deprecated v2 security contract with only the `pause` method.
   */
  public getContractWithSignerDeprecated(): SecurityDeprecatedPauseAbi {
    const contract = this.repositoryService.getCachedDSMContract();

    const oldContract = SecurityDeprecatedPauseAbi__factory.connect(
      contract.address,
      this.provider,
    );

    const wallet = this.walletService.wallet;
    const walletWithProvider = wallet.connect(this.provider);
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
    const context = await this.getGuardianExecutionContext(
      blockTag ?? 'latest',
    );
    return context.guardianIndex;
  }

  public async getGuardianAddress(blockTag: BlockTag): Promise<string> {
    const context = await this.getGuardianExecutionContext(blockTag);
    return context.guardianAddress;
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
    context: GuardianExecutionContext,
  ): Promise<Signature> {
    const prefix = await this.getAttestMessagePrefix(blockHash);
    this.selectWallet(context);

    return await this.walletService.signDepositData({
      prefix,
      depositRoot,
      nonce,
      blockNumber,
      blockHash,
      stakingModuleId,
      dsmVersion: context.dsmVersion,
      guardianAddress: context.guardianAddress,
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
    context: GuardianExecutionContext,
  ): Promise<Signature> {
    const prefix = await this.getPauseMessagePrefix(blockHash);
    this.selectWallet(context);

    return await this.walletService.signPauseDataV3({
      prefix,
      blockNumber,
      dsmVersion: context.dsmVersion,
      guardianAddress: context.guardianAddress,
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
    context: GuardianExecutionContext,
  ): Promise<ContractReceipt> {
    this.logger.warn('Try to pause deposits', { pauseBlockNumber });
    this.pauseAttempts.inc();
    this.selectWallet(context);

    const tx =
      context.mode === 'edf'
        ? await this.executeDsmCall(
            context,
            SecurityV5Abi__factory.createInterface().encodeFunctionData(
              'pauseDeposits',
              [
                pauseBlockNumber,
                {
                  guardian: constants.AddressZero,
                  signature: '0x',
                },
              ],
            ),
          )
        : await this.getContractWithSigner().pauseDeposits(pauseBlockNumber, {
            r: signature.r,
            vs: signature._vs,
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
    context: GuardianExecutionContext,
  ): Promise<Signature> {
    const prefix = await this.getUnvetMessagePrefix(blockHash);
    this.selectWallet(context);

    return await this.walletService.signUnvetData({
      prefix,
      blockNumber,
      blockHash,
      stakingModuleId,
      nonce,
      operatorIds,
      vettedKeysByOperator,
      dsmVersion: context.dsmVersion,
      guardianAddress: context.guardianAddress,
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
    context: GuardianExecutionContext,
  ): Promise<ContractReceipt> {
    this.logger.warn('Try to unvet keys for staking module', {
      stakingModuleId,
      blockNumber,
    });
    this.unvetAttempts.inc();
    this.selectWallet(context);

    const tx =
      context.mode === 'edf'
        ? await this.executeDsmCall(
            context,
            SecurityV5Abi__factory.createInterface().encodeFunctionData(
              'unvetSigningKeys',
              [
                blockNumber,
                blockHash,
                stakingModuleId,
                nonce,
                operatorIds,
                vettedKeysByOperator,
                {
                  guardian: constants.AddressZero,
                  signature: '0x',
                },
              ],
            ),
          )
        : await this.getContractWithSigner().unvetSigningKeys(
            blockNumber,
            blockHash,
            stakingModuleId,
            nonce,
            operatorIds,
            vettedKeysByOperator,
            {
              r: signature.r,
              vs: signature._vs,
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

  public async executeDsmCall(
    context: GuardianExecutionContext,
    calldata: string,
  ) {
    if (context.mode !== 'edf') {
      throw new Error('EDF execution requires an EDF guardian context');
    }

    const delegationContract = this.getDelegationContractWithSigner(context);
    return await delegationContract.execute(context.dsmAddress, calldata, {
      value: 0,
    });
  }

  private selectWallet(context: GuardianExecutionContext): void {
    if (context.mode === 'edf') {
      this.walletService.selectDelegateWallet(context.delegateAddress);
      return;
    }
    this.walletService.selectLegacyWallet();
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

    const isSupportedVersion = DSM_CONTRACT_SUPPORTED_VERSIONS.some(
      (supportedVersion) => supportedVersion === currentVersion,
    );

    if (!isSupportedVersion) {
      this.logger.warn(`Unsupported DSM contract version found: ${version}`, {
        dsmContractAddress: contract.address,
        supportedVersions: DSM_CONTRACT_SUPPORTED_VERSIONS,
        blockTag,
      });
      throw new Error(`Unsupported DSM contract version found: ${version}`);
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
