import { FORK_BLOCK, NOP_REGISTRY } from '../constants';

export const mockKey = {
  key: '0xa92daac72ad30458120e2a186400a673a4663768f118806c986ee045667c5599a608da5ea44354df124e6ac8d4ea9570',
  depositSignature:
    '0x93f492eed0fd6e86e7b50092027a06e186a5edf88250afb82c8c8ebf1febcf28e3a50669a302a4d2d451fab3d0d7d21b174ebf0061c685c2322b06dc6e714aa2a228218884e1fbe033287173c3162796acb4a526eaad031f19bd9dccb7f97a4d',
  operatorIndex: 0,
  used: false,
  index: 0,
  moduleAddress: NOP_REGISTRY,
  vetted: true,
};

export const mockKeyEvent = {
  operatorIndex: 0,
  key: '0xa92daac72ad30458120e2a186400a673a4663768f118806c986ee045667c5599a608da5ea44354df124e6ac8d4ea9570',
  moduleAddress: NOP_REGISTRY,
  logIndex: 0,
  blockNumber: FORK_BLOCK - 1,
  blockHash: '0x1',
};

export const mockKey2 = {
  key: '0x859eba194d2169faaedef29d7e3c28c954ec4790f050c9a53cb8a825700aa6cb388ffff041c69e8e4974ca716d4528fa',
  depositSignature:
    '0xb9699abf2672d54d3cab8f438e0d0cb45ad7de762ae1caff09d4bc571c4c16a91b33b11dbe567508d7db3c83a5f97adb11d53ab65ed8ffd1937da78b3942ba82bcc5b646a0c32df1ea61f0773ab5c976f0f6609bd6938f59eb2be0b20bfd14f7',
  operatorIndex: 0,
  used: true,
  moduleAddress: NOP_REGISTRY,
  index: 1,
  vetted: true,
};
