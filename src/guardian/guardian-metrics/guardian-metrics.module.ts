import { Module } from '@nestjs/common';
import { GuardianMetricsService } from './guardian-metrics.service';

@Module({
  imports: [],
  providers: [GuardianMetricsService],
  exports: [GuardianMetricsService],
})
export class GuardianMetricsModule {}
