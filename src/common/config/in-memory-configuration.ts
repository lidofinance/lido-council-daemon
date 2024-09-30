import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInstance,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';
import { Injectable } from '@nestjs/common';
import { Configuration, PubsubService } from './configuration';
import { SASLMechanism } from '../../transport';
import { implementationOf } from '../di/decorators/implementationOf';
import { ethers, BigNumber } from 'ethers';
import { TransformToWei } from 'common/decorators/transform-to-wei';

const RABBITMQ = 'rabbitmq';
const KAFKA = 'kafka';
const EVM_CHAIN = 'evm-chain';

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
  WALLET_PRIVATE_KEY_FILE = '';

  @IsString()
  KAFKA_CLIENT_ID = '';

  @IsString()
  BROKER_TOPIC = 'defender';

  @IsString()
  @IsIn([KAFKA, RABBITMQ, EVM_CHAIN])
  PUBSUB_SERVICE: PubsubService = RABBITMQ;

  @ValidateIf((conf) => conf.PUBSUB_SERVICE === KAFKA)
  @IsNotEmpty()
  @IsString()
  KAFKA_BROKER_ADDRESS_1 = '';

  @ValidateIf((conf) => conf.PUBSUB_SERVICE === KAFKA)
  @IsString()
  KAFKA_BROKER_ADDRESS_2 = '';

  @ValidateIf((conf) => conf.PUBSUB_SERVICE === KAFKA)
  @IsNotEmpty()
  @Transform(({ value }) => (value.toLowerCase() == 'true' ? true : false), {
    toClassOnly: true,
  })
  KAFKA_SSL = false;

  @ValidateIf((conf) => conf.PUBSUB_SERVICE === KAFKA)
  @IsNotEmpty()
  @IsString()
  @IsIn(['plain', 'scram-sha-256', 'scram-sha-512'])
  KAFKA_SASL_MECHANISM: SASLMechanism = 'scram-sha-256';

  @ValidateIf((conf) => conf.PUBSUB_SERVICE === KAFKA)
  @IsNotEmpty()
  @IsString()
  KAFKA_USERNAME = '';

  @ValidateIf((conf) => conf.PUBSUB_SERVICE === KAFKA)
  @IsNotEmpty()
  @IsString()
  KAFKA_PASSWORD = '';

  @ValidateIf((conf) => conf.PUBSUB_SERVICE === RABBITMQ)
  @IsNotEmpty()
  @IsString()
  RABBITMQ_URL = '';

  @ValidateIf((conf) => conf.PUBSUB_SERVICE === RABBITMQ)
  @IsNotEmpty()
  @IsString()
  RABBITMQ_LOGIN = '';

  @ValidateIf(
    (conf) => conf.PUBSUB_SERVICE === RABBITMQ && !conf.RABBITMQ_PASSCODE_FILE,
  )
  @IsNotEmpty()
  @IsString()
  RABBITMQ_PASSCODE = '';

  @ValidateIf(
    (conf) => conf.PUBSUB_SERVICE === RABBITMQ && !conf.RABBITMQ_PASSCODE,
  )
  @IsString()
  @IsNotEmpty()
  RABBITMQ_PASSCODE_FILE = '';

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

  @ValidateIf((conf) => !conf.KEYS_API_URL)
  @IsNotEmpty()
  @IsNumber()
  @Min(1)
  @Transform(({ value }) => parseInt(value, 10), { toClassOnly: true })
  KEYS_API_PORT = 0;

  @ValidateIf((conf) => !conf.KEYS_API_URL)
  @IsNotEmpty()
  @IsString()
  KEYS_API_HOST = '';

  @ValidateIf((conf) => {
    return !conf.KEYS_API_PORT && !conf.KEYS_API_HOST;
  })
  @IsNotEmpty()
  @IsString()
  KEYS_API_URL = '';

  @IsOptional()
  @IsString()
  LOCATOR_DEVNET_ADDRESS = '';

  @IsOptional()
  @TransformToWei()
  @IsInstance(BigNumber)
  WALLET_MIN_BALANCE: BigNumber = ethers.utils.parseEther('0.5');

  @IsOptional()
  @TransformToWei()
  @IsInstance(BigNumber)
  WALLET_CRITICAL_BALANCE: BigNumber = ethers.utils.parseEther('0.2');

  @ValidateIf((conf) => conf.PUBSUB_SERVICE === EVM_CHAIN)
  @IsNotEmpty()
  @IsString()
  EVM_CHAIN_DATA_BUS_ADDRESS = '';

  @ValidateIf((conf) => conf.PUBSUB_SERVICE === EVM_CHAIN)
  @IsNotEmpty()
  @IsString()
  EVM_CHAIN_DATA_BUS_PROVIDER_URL = '';

  @ValidateIf((conf) => conf.PUBSUB_SERVICE === EVM_CHAIN)
  @IsOptional()
  @TransformToWei()
  @IsInstance(BigNumber)
  EVM_CHAIN_DATA_BUS_WALLET_MIN_BALANCE: BigNumber =
    ethers.utils.parseEther('1');
}
