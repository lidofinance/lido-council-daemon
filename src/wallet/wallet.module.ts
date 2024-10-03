import { Module } from '@nestjs/common';
import { ConfigModule, Configuration } from 'common/config';
import { WALLET_PRIVATE_KEY } from './wallet.constants';
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
  ],
  exports: [WalletService],
})
export class WalletModule {}
