import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInstance,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  IsArray,
  ArrayMinSize,
  IsEthereumAddress,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Injectable } from '@nestjs/common';
import { Configuration, PubsubService, NonEmptyArray } from './configuration';
import { implementationOf } from '../di/decorators/implementationOf';
import { ethers, BigNumber } from 'ethers';
import { TransformToWei } from 'common/decorators/transform-to-wei';
import { parseUrlList } from './secrets';

const EVM_CHAIN = 'evm-chain';

@ValidatorConstraint({ name: 'isEthereumPrivateKey', async: false })
class IsEthereumPrivateKey implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string') return false;

    try {
      new ethers.Wallet(value);
      return true;
    } catch {
      return false;
    }
  }

  defaultMessage(args?: ValidationArguments): string {
    return `${args?.property ?? 'value'} must be a valid Ethereum private key`;
  }
}

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
  @IsIn(['error', 'warn', 'info', 'debug'])
  LOG_LEVEL = 'info';

  @IsString()
  @IsIn(['simple', 'json'])
  LOG_FORMAT = 'json';

  @ValidateIf((conf) => !conf.PROVIDERS_URLS)
  @IsNotEmpty()
  @IsString()
  RPC_URL = '';

  @IsString()
  RPC_URL_FILE = '';

  // New array-based provider configuration with backward compatibility
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @Transform(({ value }) => parseUrlList(value))
  PROVIDERS_URLS?: NonEmptyArray<string>;

  @IsString()
  PROVIDERS_URLS_FILE = '';

  @IsNotEmpty()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10), {
    toClassOnly: true,
  })
  CHAIN_ID!: number;

  /**
   * Pool of two equal wallet keys. On every block, the daemon reads the
   * effective delegate from the delegation contract and signs with the
   * matching key. A delegate rotation needs no restart. After the rotation,
   * remove the retired key from the pool. Each key is a plain env value or a
   * `_FILE` path to a secret.
   */
  @IsString()
  WALLET_PRIVATE_KEY = '';

  @IsString()
  WALLET_PRIVATE_KEY_FILE = '';

  @ValidateIf((conf) => conf.WALLET_PRIVATE_KEY_2 !== '')
  @Validate(IsEthereumPrivateKey)
  WALLET_PRIVATE_KEY_2 = '';

  @IsString()
  WALLET_PRIVATE_KEY_2_FILE = '';

  @IsString()
  BROKER_TOPIC = 'defender';

  @IsString()
  @IsIn([EVM_CHAIN])
  PUBSUB_SERVICE: PubsubService = EVM_CHAIN;

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

  @IsString()
  KEYS_API_HOST_FILE = '';

  @ValidateIf((conf) => {
    return !conf.KEYS_API_PORT && !conf.KEYS_API_HOST;
  })
  @IsNotEmpty()
  @IsString()
  KEYS_API_URL = '';

  @IsString()
  KEYS_API_URL_FILE = '';

  @IsOptional()
  @IsString()
  LOCATOR_DEVNET_ADDRESS = '';

  @ValidateIf((conf) => conf.DELEGATION_CONTRACT_ADDRESS !== '')
  @IsEthereumAddress()
  DELEGATION_CONTRACT_ADDRESS = '';

  // Only 'true', 'false' and an empty value are accepted: a typo must fail
  // validation instead of silently turning the dry run off.
  @IsOptional()
  @Transform(
    ({ value }) => {
      const normalized = String(value).toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false' || normalized === '') return false;
      return value;
    },
    { toClassOnly: true },
  )
  @IsBoolean()
  DRY_RUN = false;

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

  @ValidateIf(
    (conf) =>
      conf.PUBSUB_SERVICE === EVM_CHAIN &&
      !conf.EVM_CHAIN_DATA_BUS_PROVIDERS_URLS,
  )
  @IsNotEmpty()
  @IsString()
  EVM_CHAIN_DATA_BUS_PROVIDER_URL = '';

  @IsString()
  EVM_CHAIN_DATA_BUS_PROVIDER_URL_FILE = '';

  // New array-based data bus configuration with backward compatibility
  @ValidateIf((conf) => conf.PUBSUB_SERVICE === EVM_CHAIN)
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @Transform(({ value }) => parseUrlList(value))
  EVM_CHAIN_DATA_BUS_PROVIDERS_URLS?: NonEmptyArray<string>;

  @IsString()
  EVM_CHAIN_DATA_BUS_PROVIDERS_URLS_FILE = '';

  @ValidateIf((conf) => conf.PUBSUB_SERVICE === EVM_CHAIN)
  @IsNotEmpty()
  @IsNumber()
  @Transform(({ value }) => parseInt(value, 10), {
    toClassOnly: true,
  })
  EVM_CHAIN_DATA_BUS_CHAIN_ID!: number;

  @ValidateIf((conf) => conf.PUBSUB_SERVICE === EVM_CHAIN)
  @IsOptional()
  @TransformToWei()
  @IsInstance(BigNumber)
  EVM_CHAIN_DATA_BUS_WALLET_MIN_BALANCE: BigNumber =
    ethers.utils.parseEther('1');
}
