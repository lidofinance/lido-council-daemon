import {
  JsonRpcProvider,
  StaticJsonRpcProvider,
} from '@ethersproject/providers';
import { Module } from '@nestjs/common';
import { Configuration } from 'common/config';
import { ProviderService } from './provider.service';

@Module({
  providers: [
    ProviderService,
    {
      provide: JsonRpcProvider,
      useFactory: async (config: Configuration) => {
        return new StaticJsonRpcProvider(config.RPC_URL);
      },
      inject: [Configuration],
    },
  ],
  exports: [ProviderService],
})
export class ProviderModule {}
