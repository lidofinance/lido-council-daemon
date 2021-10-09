import * as Joi from 'joi';
import { ConfigModule as ConfigModuleSource } from '@nestjs/config';
import { EnvironmentVariables } from './interfaces';

const NODE_ENV = Joi.string()
  .valid('development', 'production', 'test')
  .default('development');

const PORT = Joi.number().empty('').default(3000);
const CORS_WHITELIST_REGEXP = Joi.string().empty('').default('');
const GLOBAL_THROTTLE_TTL = Joi.number().empty('').default(5);
const GLOBAL_THROTTLE_LIMIT = Joi.number().empty('').default(100);
const GLOBAL_CACHE_TTL = Joi.number().empty('').default(1);
const SENTRY_DSN = Joi.string().empty('').default(null);
const LOG_LEVEL = Joi.string()
  .valid('error', 'warning', 'notice', 'info', 'debug')
  .default('info');
const LOG_FORMAT = Joi.string().valid('simple', 'json').default('json');

const validationSchema = Joi.object<EnvironmentVariables>({
  NODE_ENV,
  PORT,
  CORS_WHITELIST_REGEXP,
  GLOBAL_THROTTLE_TTL,
  GLOBAL_THROTTLE_LIMIT,
  GLOBAL_CACHE_TTL,
  SENTRY_DSN,
  LOG_LEVEL,
  LOG_FORMAT,
});

export const ConfigModule = ConfigModuleSource.forRoot({ validationSchema });
