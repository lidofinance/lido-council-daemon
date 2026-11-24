import { LoggerService, Module } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Configuration } from 'common/config';
import { TransportInterface } from './transport.interface';
import { DataBusTransport } from './data-bus/data-bus.transport';
import { DataBusModule, DataBusService } from 'contracts/data-bus';

@Module({
  exports: [TransportInterface],
  imports: [DataBusModule.register()],
  providers: [
    {
      provide: TransportInterface,
      useFactory: async (
        config: Configuration,
        logger: LoggerService,
        dataBusService: DataBusService,
      ) => {
        if (config.PUBSUB_SERVICE == 'evm-chain') {
          const dataBus = new DataBusTransport(logger, dataBusService);
          await dataBus.initialize();
          return dataBus;
        }

        throw new Error(`Unsupported PUBSUB_SERVICE: ${config.PUBSUB_SERVICE}`);
      },
      inject: [Configuration, WINSTON_MODULE_NEST_PROVIDER, DataBusService],
    },
  ],
})
export class TransportModule {}
