import { WinstonModule } from 'nest-winston';
import { Configuration } from 'common/config';
import { ModuleRef } from '@nestjs/core';
import { createLoggerOptions } from './logger-options';

export const LoggerModule = WinstonModule.forRootAsync({
  imports: [],
  inject: [Configuration, ModuleRef],
  useFactory: async (config: Configuration) => createLoggerOptions(config),
});
