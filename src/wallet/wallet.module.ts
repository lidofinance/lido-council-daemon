import { Module } from '@nestjs/common';
import { ConfigModule, Configuration } from 'common/config';
import { WALLET_PRIVATE_KEYS } from './wallet.constants';
import { WalletService } from './wallet.service';

@Module({
  imports: [ConfigModule],
  providers: [
    WalletService,
    {
      provide: WALLET_PRIVATE_KEYS,
      useFactory: async (config: Configuration) => {
        return [config.WALLET_PRIVATE_KEY, config.WALLET_PRIVATE_KEY_2].filter(
          Boolean,
        );
      },
      inject: [Configuration],
    },
  ],
  exports: [WalletService],
})
export class WalletModule {}
