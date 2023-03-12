import { Global, Module } from '@nestjs/common';
import { LocatorModule } from './locator/locator.module';
import { RepositoryService } from './repository.service';

@Global()
@Module({
  imports: [LocatorModule],
  providers: [RepositoryService],
  exports: [RepositoryService],
})
export class RepositoryModule {}
