import { Controller, Get } from '@nestjs/common';
import {
  HealthCheckService,
  MemoryHealthIndicator,
  HealthCheck,
} from '@nestjs/terminus';
import { MAX_MEMORY_HEAP } from './health.constants';
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
      async () => this.memory.checkHeap('memoryHeap', MAX_MEMORY_HEAP),
      async () => this.provider.isHealthy('RPCProvider'),
    ]);
  }
}
