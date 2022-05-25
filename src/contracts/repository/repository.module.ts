import { CacheModule, Global, Module } from '@nestjs/common';
import { RepositoryService } from './repository.service';

@Global()
@Module({
  imports: [CacheModule.register({ max: 100, ttl: 0 })],
  providers: [RepositoryService],
  exports: [RepositoryService],
})
export class RepositoryModule {}
