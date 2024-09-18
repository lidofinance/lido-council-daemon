import { RegistryKey } from 'keys-api/interfaces/RegistryKey';
import { SigningKeyEvent } from 'contracts/signing-keys-registry/interfaces/event.interface';

export const keyMock1: RegistryKey = {
  key: '0xb3c90525010a5710d43acbea46047fc37ed55306d032527fa15dd7e8cd8a9a5fa490347cc5fce59936fb8300683cd9f3',
  depositSignature:
    '0x8a77d9411781360cc107344a99f6660b206d2c708ae7fa35565b76ec661a0b86b6c78f5b5691d2cf469c27d0655dfc6311451a9e0501f3c19c6f7e35a770d1a908bfec7cba2e07339dc633b8b6626216ce76ec0fa48ee56aaaf2f9dc7ccb2fe2',
  operatorIndex: 1,
  used: false,
  moduleAddress: '0x9D4AF1Ee19Dad8857db3a45B0374c81c8A1C6320',
  index: 52,
  vetted: true,
};

export const keyMock2: RegistryKey = {
  key: '0xa9bfaa8207ee6c78644c079ffc91b6e5abcc5eede1b7a06abb8fb40e490a75ea269c178dd524b65185299d2bbd2eb7b2',
  depositSignature:
    '0xaa5f2a1053ba7d197495df44d4a32b7ae10265cf9e38560a16b782978c0a24271a113c9538453b7e45f35cb64c7adb460d7a9fe8c8ce6b8c80ca42fd5c48e180c73fc08f7d35ba32e39f32c902fd333faf47611827f0b7813f11c4c518dd2e59',
  operatorIndex: 1,
  used: false,
  moduleAddress: '0x9D4AF1Ee19Dad8857db3a45B0374c81c8A1C6320',
  index: 51,
  vetted: true,
};

export const eventMock1: SigningKeyEvent = {
  operatorIndex: keyMock1.operatorIndex,
  key: keyMock1.key,
  moduleAddress: keyMock1.moduleAddress,
  logIndex: 1,
  blockNumber: 1,
  blockHash: '0x',
};

export const eventMock2: SigningKeyEvent = {
  operatorIndex: keyMock2.operatorIndex,
  key: keyMock2.key,
  moduleAddress: keyMock2.moduleAddress,
  logIndex: 1,
  blockNumber: 1,
  blockHash: '0x',
};
