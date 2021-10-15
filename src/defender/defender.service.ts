import {
  Inject,
  Injectable,
  LoggerService,
  OnModuleInit,
} from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { DepositService } from 'deposit';
import { RegistryService } from 'registry';
import { ProviderService } from 'provider';
import { SecurityService } from 'security';
import { TransportInterface } from 'transport';
import { ContractsState } from './interfaces';
import {
  getMessageTopic,
  DEFENDER_DEPOSIT_RESIGNING_BLOCKS,
  DEFENDER_PAUSE_RESIGNING_BLOCKS,
} from './defender.constants';

@Injectable()
export class DefenderService implements OnModuleInit {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private registryService: RegistryService,
    private depositService: DepositService,
    private securityService: SecurityService,
    private providerService: ProviderService,
    private transportService: TransportInterface,
  ) {}

  public async onModuleInit(): Promise<void> {
    await this.depositService.initialize();
    this.subscribeToEthereumUpdates();
  }

  private isCheckingKeys = false;

  public subscribeToEthereumUpdates() {
    const provider = this.providerService.provider;

    provider.on('block', () => this.protectPubKeys());
    this.logger.log('DefenderService subscribed to Ethereum events');
  }

  public matchPubKeys(
    nextPubKeys: string[],
    depositedPubKeys: Set<string>,
  ): string[] {
    return nextPubKeys.filter((nextPubKey) => depositedPubKeys.has(nextPubKey));
  }

  private contractsState: ContractsState | null = null;
  private depositResigningIndex: number | null = null;
  private pauseResigningIndex: number | null = null;

  public isSameContractsState(
    keysOpIndex: number,
    depositRoot: string,
  ): boolean {
    const previousState = this.contractsState;
    this.contractsState = { keysOpIndex, depositRoot };

    if (!previousState) return false;
    const isSameKeysInRegistry = previousState.keysOpIndex === keysOpIndex;
    const isSameKeysInDeposit = previousState.depositRoot === depositRoot;

    return isSameKeysInRegistry && isSameKeysInDeposit;
  }

  public async isSameDepositResigningIndex(): Promise<boolean> {
    const depositResigningIndex = await this.getDepositResigningIndex();

    const previousState = this.depositResigningIndex;
    this.depositResigningIndex = depositResigningIndex;

    if (!previousState) return false;
    return previousState === depositResigningIndex;
  }

  public async isSamePauseResigningIndex(): Promise<boolean> {
    const pauseResigningIndex = await this.getPauseResigningIndex();

    const previousState = this.pauseResigningIndex;
    this.pauseResigningIndex = pauseResigningIndex;

    if (!previousState) return false;
    return previousState === pauseResigningIndex;
  }

  public async protectPubKeys() {
    if (this.isCheckingKeys) {
      return;
    }

    try {
      this.isCheckingKeys = true;

      const [
        nextPubKeys,
        keysOpIndex,
        depositedPubKeys,
        depositRoot,
        isSameDepositResigningIndex,
        isSamePauseResigningIndex,
      ] = await Promise.all([
        this.registryService.getNextKeys(),
        this.registryService.getKeysOpIndex(),
        this.depositService.getAllPubKeys(),
        this.depositService.getDepositRoot(),
        this.isSameDepositResigningIndex(),
        this.isSamePauseResigningIndex(),
      ]);

      const alreadyDepositedPubKeys = this.matchPubKeys(
        nextPubKeys,
        depositedPubKeys,
      );

      const isIntersectionsFound = alreadyDepositedPubKeys.length > 0;
      const isSameContractsState = this.isSameContractsState(
        keysOpIndex,
        depositRoot,
      );

      const isSameResigningIndex = isIntersectionsFound
        ? isSamePauseResigningIndex
        : isSameDepositResigningIndex;

      if (isSameContractsState && isSameResigningIndex) {
        return;
      }

      if (isIntersectionsFound) {
        this.logger.warn('Already deposited keys found', {
          keys: alreadyDepositedPubKeys,
        });

        await this.handleSuspiciousCase();
      } else {
        await this.handleCorrectCase(depositRoot, keysOpIndex);
      }
    } catch (error) {
      this.logger.error(error);
    } finally {
      this.isCheckingKeys = false;
    }
  }

  public async getDepositResigningIndex(): Promise<number> {
    const block = await this.providerService.getBlockNumber();
    return Math.ceil(block / DEFENDER_DEPOSIT_RESIGNING_BLOCKS);
  }

  public async getPauseResigningIndex(): Promise<number> {
    const block = await this.providerService.getBlockNumber();
    return Math.ceil(block / DEFENDER_PAUSE_RESIGNING_BLOCKS);
  }

  public async getMessageTopic(): Promise<string> {
    const chainId = await this.providerService.getChainId();
    return getMessageTopic(chainId);
  }

  public async sendMessage(message: unknown): Promise<void> {
    const topic = await this.getMessageTopic();
    await this.transportService.publish(topic, message);
  }

  public async handleCorrectCase(depositRoot: string, keysOpIndex: number) {
    const depositData = await this.securityService.getDepositData(
      depositRoot,
      keysOpIndex,
    );

    this.logger.log('No problems found', depositData);
    await this.sendMessage(depositData);
  }

  public async handleSuspiciousCase() {
    const pauseData = await this.securityService.getPauseDepositData();
    const { blockNumber, signature } = pauseData;

    this.logger.warn('Suspicious case detected', pauseData);

    await Promise.all([
      this.securityService.pauseDeposits(blockNumber, signature),
      this.sendMessage(pauseData),
    ]);
  }
}
