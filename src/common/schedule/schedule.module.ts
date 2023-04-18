import { Global, Module } from '@nestjs/common';
import { ScheduleModule as ScheduleModuleSource } from '@nestjs/schedule';

@Global()
@Module({
  imports: [ScheduleModuleSource.forRoot()],
})
export class ScheduleModule {}
