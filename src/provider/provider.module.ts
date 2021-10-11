import { Module } from '@nestjs/common';
import { ConfigModule } from 'common/config';
import { ProviderService } from './provider.service';

@Module({
  imports: [ConfigModule],
  providers: [ProviderService],
  exports: [ProviderService],
})
export class ProviderModule {}
