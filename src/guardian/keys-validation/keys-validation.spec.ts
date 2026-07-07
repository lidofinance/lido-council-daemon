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
  invalidKey1,
  invalidKey2,
  invalidKey2GoodSign,
  validKeys,
} from './keys.fixtures';
import { GENESIS_FORK_VERSION_BY_CHAIN_ID } from 'bls/bls.constants';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { CHAINS } from '@lido-nestjs/constants';
import { SimpleFallbackJsonRpcBatchProvider } from '@lido-nestjs/execution';
import { RegistryKey } from 'keys-api/interfaces/RegistryKey';

describe('KeysValidationService', () => {
  let keysValidationService: KeysValidationService;
  let keysValidator: KeyValidatorInterface;
  let validateKeysFun: jest.SpyInstance;
  let provider: SimpleFallbackJsonRpcBatchProvider;

  const wc =
    '0x010000000000000000000000dc62f9e8c34be08501cdef4ebde0a280f576d762';

  // NOTE: Test fixtures (keys.fixtures.ts) contain key signatures generated for Goerli genesis fork version.
  // This fork version must match the network returned by MockProvider (see mock-provider.module.ts).
  // To switch to another network, regenerate all test fixtures with the corresponding genesis fork version.
  const fork = GENESIS_FORK_VERSION_BY_CHAIN_ID[CHAINS.Goerli];

  beforeAll(async () => {
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
    provider = moduleRef.get(SimpleFallbackJsonRpcBatchProvider);

    validateKeysFun = jest.spyOn(keysValidator, 'validateKeys');

    const loggerService = moduleRef.get(WINSTON_MODULE_NEST_PROVIDER);
    jest.spyOn(loggerService, 'warn').mockImplementation(() => undefined);
    jest.spyOn(loggerService, 'log').mockImplementation(() => undefined);
  });

  describe('Validate again if signature was changed', () => {
    beforeEach(() => {
      validateKeysFun.mockClear();
    });

    it('validate without use of cache', async () => {
      const duplicate = { ...invalidKey1, index: 102 };
      const keysForValidation = [
        ...validKeys,
        invalidKey1,
        // getInvalidKeys should return all invalid duplicates
        duplicate,
        invalidKey2,
      ];
      const result = await keysValidationService.getInvalidKeys(
        keysForValidation,
        wc,
      );

      // we extended RegistryKey to satisfy DepositData type
      const depositKeyList = keysForValidation.map((key) => ({
        ...key,
        depositSignature: key.depositSignature,
        withdrawalCredentials: bufferFromHexString(wc),
        genesisForkVersion: Buffer.from(fork.buffer),
      }));

      expect(validateKeysFun).toHaveBeenCalledTimes(1);
      expect(validateKeysFun).toHaveBeenCalledWith(depositKeyList);
      expect(result).toEqual([invalidKey1, duplicate, invalidKey2]);

      expect(result[0].index).toEqual(invalidKey1.index);
      expect(result[0].operatorIndex).toEqual(invalidKey1.operatorIndex);
      expect(result[0].used).toEqual(invalidKey1.used);
      expect(result[0].moduleAddress).toEqual(invalidKey1.moduleAddress);
    });

    it('validate with use of cache ', async () => {
      const duplicate = { ...invalidKey1, index: 102 };
      // Test scenario where one invalid key was removed from request's list
      const newResult = await keysValidationService.getInvalidKeys(
        [...validKeys, invalidKey1, duplicate, invalidKey2],
        wc,
      );

      expect(validateKeysFun).toHaveBeenCalledTimes(1);
      expect(validateKeysFun).toBeCalledWith([]);
      expect(newResult).toEqual([invalidKey1, duplicate, invalidKey2]);
    });

    it('validate without use of cache because of signature change', async () => {
      const duplicate = { ...invalidKey1, index: 102 };
      const invalidKey2Fix = {
        ...invalidKey2,
        depositSignature: invalidKey2GoodSign,
      };
      const keyForValidation = [
        ...validKeys,
        invalidKey1,
        duplicate,
        // change signature on valid
        invalidKey2Fix,
      ];
      const newResult = await keysValidationService.getInvalidKeys(
        keyForValidation,
        wc,
      );
      const depositKeyList = [invalidKey2Fix].map((key) => ({
        ...key,
        withdrawalCredentials: bufferFromHexString(wc),
        genesisForkVersion: Buffer.from(fork.buffer),
      }));

      expect(validateKeysFun).toHaveBeenCalledTimes(1);
      expect(validateKeysFun).toBeCalledWith(depositKeyList);
      expect(newResult).toEqual([invalidKey1, duplicate]);
    });
  });

  describe('validates against the per-module withdrawal credentials', () => {
    // same account, but the type byte flipped to 0x02 (CMv2-style module)
    const wc02 = '0x02' + wc.slice(4);

    it('treats keys as valid for their own WC type (0x01)', async () => {
      const result = await keysValidationService.getInvalidKeys(validKeys, wc);
      expect(result).toEqual([]);
    });

    it('flags the same keys as INVALID for a different WC type (0x02)', async () => {
      // signatures were produced for the 0x01 WC, so they must not validate
      // against the 0x02 module WC — otherwise a wrongly-signed key could be
      // deposited to the CMv2 module.
      const result = await keysValidationService.getInvalidKeys(
        validKeys,
        wc02,
      );
      expect(result.map((k) => k.key).sort()).toEqual(
        validKeys.map((k) => k.key).sort(),
      );
    });
  });

  describe('accepts real CMv2 (0x02) module keys', () => {
    // real keys from CMv2 module (id 5, 0x87EB…73b9) on Hoodi,
    // signed for the module's 0x02 withdrawal credentials
    const wc02 =
      '0x0200000000000000000000004473dcddbf77679a643bdb654dbd86d67f8d32f2';
    // same account, but curated (0x01) type — wrong for these keys
    const wc01 = '0x01' + wc02.slice(4);

    const cmv2Keys: RegistryKey[] = [
      {
        key: '0x860104753b11765fb14c909aab07461da9b1c2667a6662aab76b43c4617359e445a214019c6fdb649aadbf66c52cdf9f',
        depositSignature:
          '0xab50b9bf64699b96ddad91895c3d87740176bbdee78e82f2069923e9a4b9981c775d2e81ad8cee6bae527c6e3a87f5e70ff70e5aba838c05f43a0b44797b562da90f494040b1f55af9e240a0bdcd94f517feee72987743d6bc388cf46089c2cd',
        operatorIndex: 5,
        used: false,
        moduleAddress: '0x87EB69Ae51317405FD285efD2326a4a11f6173b9',
        index: 14,
        vetted: true,
      },
      {
        key: '0x96722f1affac54e575734600704d8cd50705a37ab166377fff0336c7b8a8e570a960c178ef0c1a2a8c3a77881d5cebed',
        depositSignature:
          '0x887255c6a9f394b5ec5e544c539dd3ddcb0eefda90494d44827cc53d0a8be045aea2721ed2e9f78500fdcb4cbdd1637d0a53d832917dbd21deb845b5a78d258201b42b3588738ca6ef1e2425cf6e9fa45dff4444e50bf1349f854c4ce6426c3e',
        operatorIndex: 5,
        used: false,
        moduleAddress: '0x87EB69Ae51317405FD285efD2326a4a11f6173b9',
        index: 15,
        vetted: true,
      },
    ];

    let getNetworkSpy: jest.SpyInstance;

    beforeAll(() => {
      // these keys were signed under the Hoodi genesis fork version
      getNetworkSpy = jest
        .spyOn(provider, 'getNetwork')
        .mockResolvedValue({ chainId: CHAINS.Hoodi, name: 'hoodi' } as any);
    });

    afterAll(() => {
      getNetworkSpy.mockRestore();
    });

    it('treats them as valid against the 0x02 module WC', async () => {
      const result = await keysValidationService.getInvalidKeys(cmv2Keys, wc02);
      expect(result).toEqual([]);
    });

    it('flags them as invalid against a 0x01 WC (wrong type)', async () => {
      const result = await keysValidationService.getInvalidKeys(cmv2Keys, wc01);
      expect(result.map((k) => k.key).sort()).toEqual(
        cmv2Keys.map((k) => k.key).sort(),
      );
    });
  });
});
