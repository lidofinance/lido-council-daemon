import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, Configuration } from 'common/config';
import {
  DATA_BUS_ADDRESS,
  DATA_BUS_PRIVATE_KEY,
  DATA_BUS_PRIVATE_KEY_CONFIG_PATH,
} from './data-bus.constants';
import { DataBusService } from './data-bus.service';

@Module({})
export class DataBusModule {
  static register(
    privateKeyPath = DATA_BUS_PRIVATE_KEY_CONFIG_PATH,
  ): DynamicModule {
    return {
      module: DataBusModule,
      imports: [ConfigModule],
      providers: [
        DataBusService,
        {
          provide: DATA_BUS_PRIVATE_KEY,
          useFactory: async (config: Configuration) => {
            return config[privateKeyPath];
          },
          inject: [Configuration],
        },
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
