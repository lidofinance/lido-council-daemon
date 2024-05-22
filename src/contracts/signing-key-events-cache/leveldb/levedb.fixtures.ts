import { SigningKeyEventsCacheHeaders } from '../interfaces/cache.interface';
import { SigningKeyEvent } from '../interfaces/event.interface';

export const keysMock = [
  {
    key: '0x80d12670ec69b62abd4d24c828136cbb1666a63374a66269031d6101973419b66711ed712d17da05d7ca6c0b28ecd21f',
    depositSignature:
      '0x89496064a1d745ea20a8b1f3accd576539602985184975bc0b5f092b19c0b2c96e13821726d2201333437c17cf482e5b04e3ee2ae171a01e2826270099dc129d6ffbf894421d0f071aeeb8597e6a9bafb10b559c7490dfd690f76f64e41c13b5',
    operatorIndex: 1,
    used: true,
    moduleAddress: '0x11a93807078f8BB880c1BD0ee4C387537de4b4b6',
    index: 0,
  },
  {
    key: '0x81011ad6ebe5c7844e59b1799e12de769f785f66df3f63debb06149c1782d574c8c2cd9c923fa881e9dcf6d413159863',
    depositSignature:
      '0xb56e6da7917b081ff3c8c786066124daf17ab87d10775a472cde02436444f843ea5b4f35de21906314967db503e300c510e30e990f48ff3d498e38f5d0ed55faf5398a64bac975ceb133f7fa50016054129881038aafcc792a6af9ee6a588838',
    operatorIndex: 1,
    used: true,
    moduleAddress: '0x11a93807078f8BB880c1BD0ee4C387537de4b4b6',
    index: 1,
  },
  {
    key: '0x80d12670ec69b62abd4d24c828136cbb1666a63374a66269031d6101973419b66711ed712d17da05d7ca6c0b28ecd21f',
    depositSignature:
      '0xaa2e3895af18e7157194d511b9b1981e25fd3561c59c31f66168ee4e92faba4f59d6480a7998ae269bd2640ffbdaf6a8073a47a318138f7397038add82f144f1a56e3ebc0942d0ad3aa3018ee0261cb995f31e6f351b82661d7640f41b8641d2',
    operatorIndex: 2,
    used: false,
    moduleAddress: '0x11a93807078f8BB880c1BD0ee4C387537de4b4b6',
    index: 1,
  },
];

export const eventsMock = [
  {
    key: '0x80d12670ec69b62abd4d24c828136cbb1666a63374a66269031d6101973419b66711ed712d17da05d7ca6c0b28ecd21f',
    operatorIndex: 1,
    logIndex: 1,
    blockNumber: 1591260,
    blockHash: '0x1',
  },
  {
    key: '0x80d12670ec69b62abd4d24c828136cbb1666a63374a66269031d6101973419b66711ed712d17da05d7ca6c0b28ecd21f',
    operatorIndex: 2,
    logIndex: 2,
    blockNumber: 1591260,
    blockHash: '0x1',
  },
  {
    key: '0x81011ad6ebe5c7844e59b1799e12de769f785f66df3f63debb06149c1782d574c8c2cd9c923fa881e9dcf6d413159863',
    operatorIndex: 1,
    logIndex: 1,
    blockNumber: 1591261,
    blockHash: '0x2',
  },
  {
    key: '0x80d12670ec69b62abd4d24c828136cbb1666a63374a66269031d6101973419b66711ed712d17da05d7ca6c0b28ecd21f',
    operatorIndex: 1,
    logIndex: 2,
    blockNumber: 1591261,
    blockHash: '0x2',
  },
];

export const headersMock: SigningKeyEventsCacheHeaders = {
  startBlock: 1591259,
  endBlock: 1593259,
  version: '1.0',
};

export const cacheMock: {
  data: SigningKeyEvent[];
  headers: SigningKeyEventsCacheHeaders;
} = {
  data: eventsMock,
  headers: headersMock,
};
