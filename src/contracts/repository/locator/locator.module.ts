import { Module } from '@nestjs/common';
import { LocatorService } from './locator.service';

@Module({
  imports: [],
  providers: [LocatorService],
  exports: [LocatorService],
})
export class LocatorModule {}
