import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, Configuration } from 'common/config';
import { DATA_BUS_ADDRESS } from './data-bus.constants';
import { DataBusService } from './data-bus.service';
import { DataBusProviderModule } from '../../provider/data-bus-provider.module';
import { WalletModule } from 'wallet';

@Module({})
export class DataBusModule {
  static register(): DynamicModule {
    return {
      module: DataBusModule,
      imports: [
        ConfigModule,
        DataBusProviderModule.forRootAsync(),
        WalletModule,
      ],
      providers: [
        DataBusService,
        {
          provide: DATA_BUS_ADDRESS,
          useFactory: async (config: Configuration) => {
            return config.EVM_CHAIN_DATA_BUS_ADDRESS;
          },
          inject: [Configuration],
        },
      ],
      exports: [DataBusService],
    };
  }
}
