import { RegistryKey } from 'keys-api/interfaces/RegistryKey';

// goerli keys
export const validKeys: RegistryKey[] = [
  {
    key: '0xa9bfaa8207ee6c78644c079ffc91b6e5abcc5eede1b7a06abb8fb40e490a75ea269c178dd524b65185299d2bbd2eb7b2',
    depositSignature:
      '0xaa5f2a1053ba7d197495df44d4a32b7ae10265cf9e38560a16b782978c0a24271a113c9538453b7e45f35cb64c7adb460d7a9fe8c8ce6b8c80ca42fd5c48e180c73fc08f7d35ba32e39f32c902fd333faf47611827f0b7813f11c4c518dd2e59',
    operatorIndex: 1,
    used: false,
    moduleAddress: '0x9D4AF1Ee19Dad8857db3a45B0374c81c8A1C6320',
    index: 51,
    vetted: true,
  },
  {
    key: '0xb3c90525010a5710d43acbea46047fc37ed55306d032527fa15dd7e8cd8a9a5fa490347cc5fce59936fb8300683cd9f3',
    depositSignature:
      '0x8a77d9411781360cc107344a99f6660b206d2c708ae7fa35565b76ec661a0b86b6c78f5b5691d2cf469c27d0655dfc6311451a9e0501f3c19c6f7e35a770d1a908bfec7cba2e07339dc633b8b6626216ce76ec0fa48ee56aaaf2f9dc7ccb2fe2',
    operatorIndex: 1,
    used: false,
    moduleAddress: '0x9D4AF1Ee19Dad8857db3a45B0374c81c8A1C6320',
    index: 52,
    vetted: true,
  },
];
export const invalidKey1: RegistryKey = {
  key: '0x84e85db03bee714dbecf01914460d9576b7f7226030bdbeae9ee923bf5f8e01eec4f7dfe54aa7eca6f4bccce59a0bf42',
  depositSignature:
    '0xb45b15f6e043d91eabbda838eae32f7dcb998578919bd813d8add67de9b14bc268a4fde41d08058a9dc2c40b881f47970c30fd3beee46517e4e5eebd4aba52060425e021302c987d365347d478681b2cabfd31208d0607f71f3766a53ca1ada0',
  operatorIndex: 28,
  used: false,
  moduleAddress: '0x11a93807078f8BB880c1BD0ee4C387537de4b4b6',
  index: 5,
  vetted: true,
};

export const invalidKey2: RegistryKey = {
  key: '0x9100e67cfb22cb7f1c3924e91bc8f70111f0634fa87d3361f807585e7ab06f84a0f504b7390683ce01567e5de3ad7445',
  depositSignature:
    '0x8d4ed47875fab45e9cfec65bf67c956be0b00d4d4cde2b6b898b09d07eed10457b4e2a8f496077e4a145e523d5b18749035b87c2412360d4fbbc850051b307f704a758f4ef35ca4af6c5f8f4e4a95603dc688bb3773b5a22c6c21b5440c71e13',
  operatorIndex: 1,
  used: false,
  moduleAddress: '0x9D4AF1Ee19Dad8857db3a45B0374c81c8A1C6320',
  index: 54,
  vetted: true,
};

export const invalidKey2GoodSign =
  '0x889531faa742982deab20afd3c76e4c0e4af784aed814c15ccb25fe2b77cbaaddda39dc78f364b06990972690958bae7077efa352e51c57283129598612d2ce4f3f4a4df06695d42d804ebc923a1811c80b60503b8c87e19ceee8c0bc1bb9650';
