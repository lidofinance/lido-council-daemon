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
const COUNCIL_ID = Joi.string();
const KAFKA_SASL_MECHANISM = Joi.string().default('scram-sha-256');
const KAFKA_SSL = Joi.boolean().default(true);
const KAFKA_USERNAME = Joi.string().empty('');
const KAFKA_PASSWORD = Joi.string().empty('');
const KAFKA_BROKER_1 = Joi.string();

const validationSchema = Joi.object<EnvironmentVariables>({
  NODE_ENV,
  PORT,
  LOG_LEVEL,
  LOG_FORMAT,
  RPC_URL,
  COUNCIL_ID,
  KAFKA_SSL,
  KAFKA_SASL_MECHANISM,
  KAFKA_USERNAME,
  KAFKA_PASSWORD,
  KAFKA_BROKER_1,
});

export const ConfigModule = ConfigModuleSource.forRoot({ validationSchema });
