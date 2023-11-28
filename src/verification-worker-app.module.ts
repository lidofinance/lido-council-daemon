import { Module } from '@nestjs/common';
import { AppService } from 'app.service';
import { LoggerModule } from 'common/logger';
import { ProviderModule } from 'provider';
import { BlsModule } from 'bls';

@Module({
  imports: [ProviderModule.forRoot(), LoggerModule, BlsModule],
  providers: [AppService],
})
export class VerificationWorkerAppModule {}
