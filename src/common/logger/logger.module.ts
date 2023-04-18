import { WinstonModule } from 'nest-winston';
import * as winston from 'winston';
import { Configuration } from 'common/config';
import { ModuleRef } from '@nestjs/core';

export const LoggerModule = WinstonModule.forRootAsync({
  imports: [],
  inject: [Configuration, ModuleRef],
  useFactory: async (config: Configuration) => ({
    level: config.LOG_LEVEL,
    transports: [
      new winston.transports.Console({
        format:
          config.LOG_FORMAT === 'json'
            ? winston.format.json()
            : winston.format.combine(
                winston.format.colorize({ all: true }),
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                winston.format.simple(),
                winston.format.printf((log) => {
                  const { timestamp, level, message, context } = log;
                  const extra = context ? JSON.stringify(context) : '';

                  return `${timestamp} ${level}: ${message} ${extra}`;
                }),
              ),
      }),
    ],
  }),
});
