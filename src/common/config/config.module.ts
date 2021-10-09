import * as Joi from 'joi';
import { ConfigModule as ConfigModuleSource } from '@nestjs/config';
import { EnvironmentVariables } from './interfaces';

const NODE_ENV = Joi.string()
  .valid('development', 'production', 'test')
  .default('development');

const PORT = Joi.number().empty('').default(3000);
const LOG_LEVEL = Joi.string()
  .valid('error', 'warning', 'notice', 'info', 'debug')
  .default('info');
const LOG_FORMAT = Joi.string().valid('simple', 'json').default('json');
const RPC_URL = Joi.string();

const validationSchema = Joi.object<EnvironmentVariables>({
  NODE_ENV,
  PORT,
  LOG_LEVEL,
  LOG_FORMAT,
  RPC_URL,
});

export const ConfigModule = ConfigModuleSource.forRoot({ validationSchema });
