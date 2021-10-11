import { Module } from '@nestjs/common';
import { ConfigModule } from 'common/config';
import { WalletService } from './wallet.service';

@Module({
  imports: [ConfigModule],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
