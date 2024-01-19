import { Test } from '@nestjs/testing';
import { KeysValidationModule } from './keys-validation.module';
import {
  KeyValidatorInterface,
  KeyValidatorModule,
  bufferFromHexString,
} from '@lido-nestjs/key-validation';
import { KeysValidationService } from './keys-validation.service';
import { LoggerModule } from 'common/logger';
import { ConfigModule } from 'common/config';
import { MockProviderModule } from 'provider';
import {
  invalidKey,
  invalidKey2,
  invalidKey2GoodSign,
  validKeys,
} from './keys.fixtures';
import { GENESIS_FORK_VERSION_BY_CHAIN_ID } from 'bls/bls.constants';

describe('KeysValidationService', () => {
  let keysValidationService: KeysValidationService;
  let keysValidator: KeyValidatorInterface;

  let validateKeysFun: jest.SpyInstance;

  const wc =
    '0x010000000000000000000000dc62f9e8c34be08501cdef4ebde0a280f576d762';

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot(),
        MockProviderModule.forRoot(),
        LoggerModule,
        KeyValidatorModule.forFeature({ multithreaded: true }),
        KeysValidationModule,
      ],
    }).compile();

    keysValidationService = moduleRef.get(KeysValidationService);
    keysValidator = moduleRef.get(KeyValidatorInterface);

    validateKeysFun = jest.spyOn(keysValidator, 'validateKeys');
  });

  it('should find and return invalid keys from the provided list', async () => {
    // Test scenario where new invalid keys are added to the list
    const result = await keysValidationService.findInvalidKeys(
      [...validKeys, invalidKey, invalidKey2],
      wc,
    );

    const expected = [invalidKey, invalidKey2].map((key) => ({
      key: key.key,
      depositSignature: key.depositSignature,
    }));

    const fork = GENESIS_FORK_VERSION_BY_CHAIN_ID[5];

    const depositData = [...validKeys, invalidKey, invalidKey2].map((key) => ({
      key: key.key,
      depositSignature: key.depositSignature,
      withdrawalCredentials: bufferFromHexString(wc),
      genesisForkVersion: Buffer.from(fork.buffer),
    }));

    expect(validateKeysFun).toBeCalledTimes(1);
    expect(validateKeysFun).toBeCalledWith(depositData);
    expect(result).toEqual(expect.arrayContaining(expected));
    expect(result.length).toEqual(expected.length);

    validateKeysFun.mockClear();
    // Test scenario where one invalid key was removed from request's list
    const newResult = await keysValidationService.findInvalidKeys(
      [...validKeys, invalidKey],
      wc,
    );

    const newExpected = [invalidKey].map((key) => ({
      key: key.key,
      depositSignature: key.depositSignature,
    }));

    expect(keysValidationService['keysCache'].get(invalidKey2.key)).toEqual({
      isValid: false,
      signature: invalidKey2.depositSignature,
    });

    expect(validateKeysFun).toBeCalledTimes(1);
    expect(validateKeysFun).toBeCalledWith([]);
    expect(newResult).toEqual(expect.arrayContaining(newExpected));
    expect(newResult.length).toEqual(newExpected.length);
  });

  it('should validate key again if signature was changed', async () => {
    // if signature was changed we need to repeat validation
    // invalid key could become valid and visa versa
    // Test scenario where new invalid keys are added to the list
    const result = await keysValidationService.findInvalidKeys(
      [...validKeys, invalidKey, invalidKey2],
      wc,
    );

    const expected = [invalidKey, invalidKey2].map((key) => ({
      key: key.key,
      depositSignature: key.depositSignature,
    }));

    const fork = GENESIS_FORK_VERSION_BY_CHAIN_ID[5];

    const depositData = [...validKeys, invalidKey, invalidKey2].map((key) => ({
      key: key.key,
      depositSignature: key.depositSignature,
      withdrawalCredentials: bufferFromHexString(wc),
      genesisForkVersion: Buffer.from(fork.buffer),
    }));

    expect(validateKeysFun).toBeCalledTimes(1);
    expect(validateKeysFun).toBeCalledWith(depositData);
    expect(result).toEqual(expect.arrayContaining(expected));
    expect(result.length).toEqual(expected.length);

    validateKeysFun.mockClear();
    // Test scenario where one invalid key was changed
    const newResult = await keysValidationService.findInvalidKeys(
      [
        ...validKeys,
        invalidKey,
        { ...invalidKey2, depositSignature: invalidKey2GoodSign },
      ],
      wc,
    );

    const newDepositData = [
      { ...invalidKey2, depositSignature: invalidKey2GoodSign },
    ].map((key) => ({
      key: key.key,
      depositSignature: key.depositSignature,
      withdrawalCredentials: bufferFromHexString(wc),
      genesisForkVersion: Buffer.from(fork.buffer),
    }));

    const newExpected = [invalidKey].map((key) => ({
      key: key.key,
      depositSignature: key.depositSignature,
    }));

    expect(validateKeysFun).toBeCalledTimes(1);
    expect(validateKeysFun).toBeCalledWith(newDepositData);
    expect(newResult).toEqual(expect.arrayContaining(newExpected));
    expect(newResult.length).toEqual(newExpected.length);
  });
});
