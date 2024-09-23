import { TransportInterface } from '../transport.interface';
import {
  Inject,
  Injectable,
  LoggerService,
  OnModuleInit,
} from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { implementationOf } from '../../common/di/decorators/implementationOf';
import { MessageType } from '../../messages';
import { DataBusService } from 'contracts/data-bus';

@Injectable()
@implementationOf(TransportInterface)
export class DataBusTransport implements TransportInterface, OnModuleInit {
  public constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER) private logger: LoggerService,
    private dataBusService: DataBusService,
  ) {}

  async onModuleInit() {
    this.logger.log('DataBusTransport initialized');
  }

  public async initialize() {
    await this.dataBusService.initialize();
  }

  public async publish<T>(
    topic: string,
    message: T,
    messageType: MessageType,
  ): Promise<void> {
    this.logger.log?.(
      `Publishing message of type "${messageType}" to topic "${topic}"`,
    );
    await this.dataBusService.publish(message as any);
  }

  public async subscribe<T>(
    topic: string,
    messageType: MessageType,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _cb: (message: T) => Promise<void>,
  ): Promise<void> {
    this.logger.log(
      `Subscribing to topic "${topic}" for messages of type "${messageType}"`,
    );
  }

  public async disconnect() {
    this.logger.log('Disconnecting DataBusTransport');
  }
}
