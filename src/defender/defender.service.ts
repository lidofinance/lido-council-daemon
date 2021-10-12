import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { DepositService } from 'deposit';
import { RegistryService } from 'registry';
import { ProviderService } from 'provider';
import { SecurityService } from 'security';
import { TransportInterface } from 'transport';
import { DefenderState } from './interfaces';
import { getMessageTopic } from './defender.constants';

@Injectable()
export class DefenderService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private registryService: RegistryService,
    private depositService: DepositService,
    private securityService: SecurityService,
    private providerService: ProviderService,
    private transportService: TransportInterface,
  ) {
    this.initialize();
  }

  public async initialize(): Promise<void> {
    this.subscribeToTransportEvents();

    await this.depositService.initialize();
    this.subscribeToEthereumUpdates();
  }

  private async subscribeToTransportEvents() {
    const topic = await this.getMessageTopic();
    await this.transportService.subscribe(topic, async (message) => {
      this.logger.debug('Transport event', message);
    });

    this.logger.log('DefenderService subscribed to Transport events');
  }

  private async subscribeToEthereumUpdates() {
    const provider = this.providerService.provider;

    provider.on('block', () => this.protectPubKeys());
    this.logger.log('DefenderService subscribed to Ethereum events');
  }

  private matchPubKeys = (
    nextPubKeys: string[],
    depositedPubKeys: Set<string>,
  ): string[] => {
    return nextPubKeys.filter((nextPubKey) => depositedPubKeys.has(nextPubKey));
  };

  private state: DefenderState | null = null;

  private isSameState(
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

  private async protectPubKeys() {
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
      this.logger.warn({ alreadyDepositedPubKeys });
      await this.handleSuspiciousCase();
    } else {
      await this.handleCorrectCase(depositRoot, keysOpIndex);
    }
  }

  private async getMessageTopic(): Promise<string> {
    const chainId = await this.providerService.getChainId();
    return getMessageTopic(chainId);
  }

  private async sendMessage(message: unknown): Promise<void> {
    const topic = await this.getMessageTopic();
    await this.transportService.publish(topic, message);
  }

  private async handleCorrectCase(depositRoot: string, keysOpIndex: number) {
    const depositData = await this.securityService.getDepositData(
      depositRoot,
      keysOpIndex,
    );

    this.logger.debug('Correct case', depositData);
    this.sendMessage(depositData);
  }

  private async handleSuspiciousCase() {
    const pauseData = await this.securityService.getPauseDepositData();
    const { blockNumber, blockHash, signature } = pauseData;

    this.logger.debug('Suspicious case', pauseData);

    await Promise.all([
      this.securityService.pauseDeposits(blockNumber, blockHash, signature),
      this.sendMessage(pauseData),
    ]);
  }
}
