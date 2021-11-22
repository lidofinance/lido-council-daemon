import { Controller, Get } from '@nestjs/common';
import {
  HealthCheckService,
  MemoryHealthIndicator,
  HealthCheck,
} from '@nestjs/terminus';
import { ProviderHealthIndicator } from './provider.health';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private memory: MemoryHealthIndicator,
    private provider: ProviderHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      async () => this.memory.checkHeap('memoryHeap', 1024 * 1024 * 1024),
      async () => this.provider.isHealthy('RPCProvider'),
    ]);
  }
}
