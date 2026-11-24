import * as winston from 'winston';
import { cleanSecrets } from '@lido-nestjs/logger';
import type { Configuration } from 'common/config/configuration';
import { logMaskOptions } from 'common/config/secrets';

/**
 * Options of the app logger. They live outside the logger module, so the
 * config module can use them without an import cycle.
 */
export const createLoggerOptions = (
  config: Configuration,
): winston.LoggerOptions => ({
  level: config.LOG_LEVEL,
  // Runs before every transport format, so it is the one masking point.
  format: cleanSecrets(logMaskOptions(config)),
  transports: [
    new winston.transports.Console({
      silent: process.env.E2E_SILENT_LOGS === 'true',
      format:
        config.LOG_FORMAT === 'json'
          ? winston.format.combine(
              winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
              winston.format((info) => {
                info.pid = process.pid;
                return info;
              })(),
              winston.format.json(),
            )
          : winston.format.combine(
              winston.format.colorize({ all: true }),
              winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
              winston.format.printf((log) => {
                const { timestamp, level, message, context } = log;
                const extra = context ? JSON.stringify(context) : '';

                return `${timestamp} [PID:${process.pid}] ${level}: ${message} ${extra}`;
              }),
            ),
    }),
  ],
});
