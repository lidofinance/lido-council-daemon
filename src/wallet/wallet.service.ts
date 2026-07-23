import { defaultAbiCoder } from '@ethersproject/abi';
import { Signature } from '@ethersproject/bytes';
import { keccak256 } from '@ethersproject/keccak256';
import { formatEther } from '@ethersproject/units';
import { Wallet } from '@ethersproject/wallet';
import { BigNumber } from '@ethersproject/bignumber';
import {
  Inject,
  Injectable,
  LoggerService,
  OnModuleInit,
} from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { OneAtTime } from 'common/decorators';
import {
  METRIC_ACCOUNT_BALANCE,
  METRIC_NONCE_LATEST,
  METRIC_NONCE_PENDING,
  METRIC_NONCE_GAP,
} from 'common/prometheus';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Gauge, register } from 'prom-client';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import {
  WALLET_BALANCE_UPDATE_BLOCK_RATE,
  WALLET_PRIVATE_KEY,
} from './wallet.constants';
import {
  SignDepositDataParams,
  SignModulePauseDataParams,
  SignPauseDataParams,
  SignUnvetDataParams,
} from './wallet.interfaces';
import { Configuration } from 'common/config';
import { utils } from 'ethers';
import { DSM_CONTRACT_VERSION_5 } from 'contracts/security/security.constants';

@Injectable()
export class WalletService implements OnModuleInit {
  constructor(
    @InjectMetric(METRIC_ACCOUNT_BALANCE) private accountBalance: Gauge<string>,
    @InjectMetric(METRIC_NONCE_LATEST) private nonceLatest: Gauge<string>,
    @InjectMetric(METRIC_NONCE_PENDING) private noncePending: Gauge<string>,
    @InjectMetric(METRIC_NONCE_GAP) private nonceGap: Gauge<string>,
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    @Inject(WALLET_PRIVATE_KEY) private privateKey: string,
    private provider: SimpleFallbackJsonRpcBatchProvider,
    protected readonly config: Configuration,
  ) {}

  async onModuleInit() {
    const guardianAddress = this.address;
    register.setDefaultLabels({ guardianAddress });

    try {
      await this.monitorGuardianBalance();
      this.subscribeToEthereumUpdates();
    } catch (error) {
      this.logger.error(error);
    }
  }

  /**
   * Subscribes to the event of a new block appearance
   */
  public subscribeToEthereumUpdates() {
    this.provider.on('block', async (blockNumber) => {
      if (blockNumber % WALLET_BALANCE_UPDATE_BLOCK_RATE !== 0) return;
      await this.monitorGuardianBalance().catch((error) =>
        this.logger.error(error),
      );
    });

    this.logger.log('WalletService subscribed to Ethereum events');
  }

  /**
   * Monitors the guardian account balance and nonce to ensure it is sufficient for transactions.
   * Updates the account balance and nonce metrics.
   */
  @OneAtTime()
  public async monitorGuardianBalance() {
    const [balanceWei, latestNonce, pendingNonce] = await Promise.all([
      this.getAccountBalance(),
      this.provider.getTransactionCount(this.address, 'latest'),
      this.provider.getTransactionCount(this.address, 'pending'),
    ]);

    const balanceETH = formatEther(balanceWei);
    this.accountBalance.set(Number(balanceETH));
    this.isBalanceSufficient(balanceWei);

    const gap = pendingNonce - latestNonce;
    this.nonceLatest.labels({ network: 'ethereum' }).set(latestNonce);
    this.noncePending.labels({ network: 'ethereum' }).set(pendingNonce);
    this.nonceGap.labels({ network: 'ethereum' }).set(gap);
  }

  /**
   * Retrieves the account balance in Wei.
   * @returns The account balance in Wei.
   */
  public async getAccountBalance(): Promise<BigNumber> {
    return await this.provider.getBalance(this.address);
  }

  /**
   * Checks if the balance is at or below the critical threshold,
   * indicating that the balance is critical and may require intervention.
   *
   * @returns True if the balance is at or below the critical value, otherwise false.
   */
  public async isBalanceCritical(): Promise<boolean> {
    const balanceWei = await this.getAccountBalance();
    const balanceETH = formatEther(balanceWei);
    const formatted = `${balanceETH} ETH`;
    const isCritical = balanceWei.lte(this.config.WALLET_CRITICAL_BALANCE);

    if (isCritical) {
      this.logger.log('Account balance is critical', { balance: formatted });
    }

    return isCritical;
  }

  /**
   * Checks if the balance is sufficient to perform at least 10 unvetting operations.
   * @param balanceWei The current balance in Wei.
   * @returns True if the balance is sufficient, otherwise false.
   */
  public isBalanceSufficient(balanceWei): boolean {
    const balanceETH = formatEther(balanceWei);
    const formatted = `${balanceETH} ETH`;
    const isSufficient = balanceWei.gte(this.config.WALLET_MIN_BALANCE);

    if (isSufficient) {
      this.logger.log('Account balance is sufficient', { balance: formatted });
    } else {
      this.logger.warn('Account balance is too low', { balance: formatted });
    }

    return isSufficient;
  }

  /**
   * Wallet class inherits Signer and can sign transactions and messages
   * using a private key as a standard Externally Owned Account (EOA)
   */
  public get wallet(): Wallet {
    if (this.cachedWallet) return this.cachedWallet;

    if (!this.privateKey) {
      this.logger.warn(
        'Private key is not provided, a random address will be generated for the test run',
      );

      this.privateKey = Wallet.createRandom().privateKey;
    }

    this.cachedWallet = new Wallet(this.privateKey);
    return this.cachedWallet;
  }

  private cachedWallet: Wallet | null = null;

  /**
   * Guardian wallet address
   */
  public get address(): string {
    return this.wallet.address;
  }

  /**
   * Signs a message using a private key
   * @param message - message that is signed
   * @returns signature
   */
  public signMessage(message: string): Signature {
    return this.wallet._signingKey().signDigest(message);
  }

  /**
   * Signs a message to deposit buffered ethers
   * @param signDepositDataParams - parameters for signing deposit message
   * @param signDepositDataParams.prefix - unique prefix from the contract for this type of message
   * @param signDepositDataParams.depositRoot - current deposit root from the deposit contract
   * @param signDepositDataParams.nonce - current index of keys operations from the registry contract
   * @param signDepositDataParams.blockNumber - current block number
   * @param signDepositDataParams.blockHash - current block hash
   * @param signDepositDataParams.stakingModuleId - target module id
   * @returns signature
   */
  public async signDepositData({
    prefix,
    blockNumber,
    blockHash,
    depositRoot,
    nonce,
    stakingModuleId,
    dsmVersion,
    guardianAddress,
  }: SignDepositDataParams): Promise<Signature> {
    const encodedData =
      dsmVersion === DSM_CONTRACT_VERSION_5
        ? utils.solidityPack(
            [
              'bytes32',
              'address',
              'uint256',
              'bytes32',
              'bytes32',
              'uint256',
              'uint256',
            ],
            [
              prefix,
              this.requireGuardianAddress(guardianAddress),
              blockNumber,
              blockHash,
              depositRoot,
              stakingModuleId,
              nonce,
            ],
          )
        : defaultAbiCoder.encode(
            ['bytes32', 'uint256', 'bytes32', 'bytes32', 'uint256', 'uint256'],
            [
              prefix,
              blockNumber,
              blockHash,
              depositRoot,
              stakingModuleId,
              nonce,
            ],
          );

    return this.signMessage(keccak256(encodedData));
  }

  /**
   * Signs a message to pause deposits
   * @param signPauseDataParams - parameters for signing pause message
   * @param signPauseDataParams.prefix - unique prefix from the contract for this type of message
   * @param signPauseDataParams.blockNumber - block number that is signed
   * @returns signature
   */
  public async signPauseDataV3({
    prefix,
    blockNumber,
    dsmVersion,
    guardianAddress,
  }: SignPauseDataParams): Promise<Signature> {
    const encodedData =
      dsmVersion === DSM_CONTRACT_VERSION_5
        ? utils.solidityPack(
            ['bytes32', 'address', 'uint256'],
            [prefix, this.requireGuardianAddress(guardianAddress), blockNumber],
          )
        : defaultAbiCoder.encode(['bytes32', 'uint256'], [prefix, blockNumber]);

    return this.signMessage(keccak256(encodedData));
  }

  /**
   * Signs a message to pause deposits
   * @param signPauseDataParams - parameters for signing pause message
   * @param signPauseDataParams.prefix - unique prefix from the contract for this type of message
   * @param signPauseDataParams.blockNumber - block number that is signed
   * @param signPauseDataParams.stakingModuleId - target staking module id
   * @returns signature
   */
  public async signPauseDataV2({
    prefix,
    blockNumber,
    stakingModuleId,
  }: SignModulePauseDataParams): Promise<Signature> {
    const encodedData = defaultAbiCoder.encode(
      ['bytes32', 'uint256', 'uint256'],
      [prefix, blockNumber, stakingModuleId],
    );

    const messageHash = keccak256(encodedData);
    return this.signMessage(messageHash);
  }

  /**
   * Sign a message to unvet signing keys
   * @param signUnvetDataParams - parameters for signing unvet message
   * @param signUnvetDataParams.prefix - unique prefix from the contract for this type of message
   * @param signUnvetDataParams.blockNumber - block number that is signed
   * @param signUnvetDataParams.blockHash - current block hash
   * @param signUnvetDataParams.nonce - current index of keys operations from the registry contract
   * @param signUnvetDataParams.stakingModuleId - target staking module id
   * @param signDepositDataParams.operatorIds - list of operators ids for unvetting
   * @param signDepositDataParams.vettedKeysByOperator - list of new values for vetted validators amount for operator
   * @returns
   */
  public async signUnvetData({
    prefix,
    blockNumber,
    blockHash,
    nonce,
    stakingModuleId,
    operatorIds,
    vettedKeysByOperator,
    dsmVersion,
    guardianAddress,
  }: SignUnvetDataParams): Promise<Signature> {
    this.logger.debug?.('Sign data:', {
      prefix,
      blockNumber,
      blockHash,
      stakingModuleId,
      nonce,
      operatorIds,
      vettedKeysByOperator,
    });

    const encodedData =
      dsmVersion === DSM_CONTRACT_VERSION_5
        ? utils.solidityPack(
            [
              'bytes32',
              'address',
              'uint256',
              'bytes32',
              'uint256',
              'uint256',
              'bytes',
              'bytes',
            ],
            [
              prefix,
              this.requireGuardianAddress(guardianAddress),
              blockNumber,
              blockHash,
              stakingModuleId,
              nonce,
              operatorIds,
              vettedKeysByOperator,
            ],
          )
        : utils.solidityPack(
            [
              'bytes32',
              'uint256',
              'bytes32',
              'uint256',
              'uint256',
              'bytes',
              'bytes',
            ],
            [
              prefix,
              blockNumber,
              blockHash,
              stakingModuleId,
              nonce,
              operatorIds,
              vettedKeysByOperator,
            ],
          );
    const messageHash = keccak256(encodedData);

    this.logger.debug?.('Message hash:', {
      messageHash,
      blockHash,
      blockNumber,
    });

    return this.signMessage(messageHash);
  }

  private requireGuardianAddress(guardianAddress?: string): string {
    if (!guardianAddress || !utils.isAddress(guardianAddress)) {
      throw new Error('A valid guardian address is required for DSM version 5');
    }
    return utils.getAddress(guardianAddress);
  }
}
