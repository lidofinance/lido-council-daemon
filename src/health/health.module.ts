import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';
import { ReadyController } from './ready.controller';

@Module({
  controllers: [HealthController, ReadyController],
  imports: [TerminusModule],
})
export class HealthModule {}
