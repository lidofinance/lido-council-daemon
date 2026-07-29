import { Module } from '@nestjs/common';
import { ConfigModule, Configuration } from 'common/config';
import { DELEGATE_PRIVATE_KEYS, WALLET_PRIVATE_KEY } from './wallet.constants';
import { WalletService } from './wallet.service';

@Module({
  imports: [ConfigModule],
  providers: [
    WalletService,
    {
      provide: WALLET_PRIVATE_KEY,
      useFactory: async (config: Configuration) => {
        return config.WALLET_PRIVATE_KEY;
      },
      inject: [Configuration],
    },
    {
      provide: DELEGATE_PRIVATE_KEYS,
      useFactory: async (config: Configuration) => {
        return config.DELEGATE_PRIVATE_KEYS;
      },
      inject: [Configuration],
    },
  ],
  exports: [WalletService],
})
export class WalletModule {}
