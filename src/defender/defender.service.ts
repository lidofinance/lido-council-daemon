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
import { DefenderState } from './interfaces';
import { getMessageTopic } from './defender.constants';

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

  public async subscribeToEthereumUpdates() {
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

  public state: DefenderState | null = null;

  public isSameState(
    actualStateIndex: number,
    keysOpIndex: number,
    depositRoot: string,
  ): boolean {
    const previousState = this.state;
    this.state = { actualStateIndex, keysOpIndex, depositRoot };

    if (!previousState) return false;
    const isSameKeysInRegistry = previousState.keysOpIndex === keysOpIndex;
    const isSameKeysInDeposit = previousState.depositRoot === depositRoot;
    const isSameActualIndex =
      previousState.actualStateIndex === actualStateIndex;

    return isSameActualIndex && isSameKeysInRegistry && isSameKeysInDeposit;
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
        actualStateIndex,
        depositedPubKeys,
        depositRoot,
      ] = await Promise.all([
        this.registryService.getNextKeys(),
        this.registryService.getKeysOpIndex(),
        this.registryService.getActualStateIndex(),
        this.depositService.getAllPubKeys(),
        this.depositService.getDepositRoot(),
      ]);

      if (this.isSameState(actualStateIndex, keysOpIndex, depositRoot)) {
        return;
      }

      const alreadyDepositedPubKeys = this.matchPubKeys(
        nextPubKeys,
        depositedPubKeys,
      );

      if (alreadyDepositedPubKeys.length) {
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
