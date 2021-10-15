import { Module } from '@nestjs/common';
import { Configuration } from 'common/config';
import { ProviderModule } from 'provider';
import { WALLET_PRIVATE_KEY } from './wallet.constants';
import { WalletService } from './wallet.service';

@Module({
  imports: [ProviderModule],
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
