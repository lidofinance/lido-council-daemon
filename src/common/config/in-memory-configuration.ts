import { Transform } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Injectable } from '@nestjs/common';
import { Configuration, PubsubService } from './configuration';
import { SASLMechanism } from '../../transport';
import { implementationOf } from '../di/decorators/implementationOf';

@Injectable()
@implementationOf(Configuration)
export class InMemoryConfiguration implements Configuration {
  @IsNotEmpty()
  @IsIn(['development', 'production', 'test'])
  NODE_ENV = 'development';

  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10), { toClassOnly: true })
  PORT = 3000;

  @IsNotEmpty()
  @IsIn(['error', 'warning', 'notice', 'info', 'debug'])
  LOG_LEVEL = 'info';

  @IsString()
  @IsIn(['simple', 'json'])
  LOG_FORMAT = 'json';

  @IsNotEmpty()
  @IsString()
  RPC_URL = '';

  @IsString()
  WALLET_PRIVATE_KEY = '';

  @IsString()
  KAFKA_CLIENT_ID = '';

  @IsString()
  BROKER_TOPIC = '';

  @IsString()
  @IsIn(['kafka', 'rabbitmq'])
  PUBSUB_SERVICE: PubsubService = 'rabbitmq';

  @IsString()
  KAFKA_BROKER_ADDRESS_1 = '';

  @IsString()
  KAFKA_BROKER_ADDRESS_2 = '';

  @Transform(({ value }) => (value.toLowerCase() == 'true' ? true : false), {
    toClassOnly: true,
  })
  KAFKA_SSL = false;

  @IsString()
  @IsIn(['plain', 'scram-sha-256', 'scram-sha-512'])
  KAFKA_SASL_MECHANISM: SASLMechanism = 'scram-sha-256';

  @IsString()
  KAFKA_USERNAME = '';

  @IsString()
  KAFKA_PASSWORD = '';

  @IsString()
  RABBITMQ_URL = '';

  @IsString()
  RABBITMQ_VIRTUAL_HOST = '%2f';

  @IsString()
  RABBITMQ_LOGIN = '';

  @IsString()
  RABBITMQ_PASSCODE = '';

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10), { toClassOnly: true })
  REGISTRY_KEYS_QUERY_BATCH_SIZE = 200;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10), { toClassOnly: true })
  REGISTRY_KEYS_QUERY_CONCURRENCY = 5;
}
