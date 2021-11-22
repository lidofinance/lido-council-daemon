import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { ProviderHealthIndicator } from './provider.health';

@Module({
  providers: [ProviderHealthIndicator],
  controllers: [HealthController],
  imports: [TerminusModule],
})
export class HealthModule {}
