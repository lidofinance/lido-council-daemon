import { Inject, Injectable, LoggerService } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { DepositService } from 'deposit';
import { RegistryService } from 'registry';
import { LidoService } from 'lido';
import { ProviderService } from 'provider';
import { DefenderState } from './interfaces';

@Injectable()
export class DefenderService {
  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: LoggerService,
    private readonly registryService: RegistryService,
    private readonly depositService: DepositService,
    private readonly lidoService: LidoService,
    private readonly providerService: ProviderService,
  ) {
    this.init();
  }

  public async init(): Promise<void> {
    this.logger.debug('Init defender');

    await this.depositService.initProcessEvents();
    this.subscribeToUpdates();
  }

  private async subscribeToUpdates() {
    const provider = this.providerService.provider;

    provider.on('block', () => this.protectPubKeys());
    this.logger.debug('The defender subscribed to the events');
  }

  private matchPubKeys = (
    nextPubKeys: string[],
    depositedPubKeys: Set<string>,
  ): string[] => {
    return nextPubKeys.filter((nextPubKey) => depositedPubKeys.has(nextPubKey));
  };

  private state: DefenderState | null = null;

  private isSameState(keysOpIndex: number, depositRoot: string): boolean {
    const previousState = this.state;
    this.state = { keysOpIndex, depositRoot };

    if (!previousState) return false;
    const isSameKeysInRegistry = previousState.keysOpIndex === keysOpIndex;
    const isSameKeysInDeposit = previousState.depositRoot === depositRoot;

    return isSameKeysInRegistry && isSameKeysInDeposit;
  }

  private async protectPubKeys() {
    const [nextPubKeys, keysOpIndex, depositedPubKeys, depositRoot] =
      await Promise.all([
        this.registryService.getNextKeys(),
        this.registryService.getKeysOpIndex(),
        this.depositService.getPubKeys(),
        this.depositService.getDepositRoot(),
      ]);

    if (this.isSameState(keysOpIndex, depositRoot)) {
      return;
    }

    const alreadyDepositedPubKeys = this.matchPubKeys(
      nextPubKeys,
      depositedPubKeys,
    );

    if (alreadyDepositedPubKeys.length) {
      this.logger.warn({ alreadyDepositedPubKeys });
      this.handleSuspiciousCase();
    } else {
      this.handleCorrectCase(depositRoot, keysOpIndex);
    }
  }

  private async sendMessage(message: unknown): Promise<void> {
    message; // TODO
  }

  private async handleCorrectCase(depositRoot: string, keysOpIndex: number) {
    const message = { depositRoot, keysOpIndex }; // TODO
    this.logger.debug('Correct case', message);

    this.sendMessage(message);
  }

  private async handleSuspiciousCase() {
    const message = {}; // TODO
    this.logger.debug('Suspicious case', message);

    await Promise.all([
      this.lidoService.stopProtocol(),
      this.sendMessage(message),
    ]);
  }
}
