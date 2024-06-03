import { SigningKeyEventsCacheHeaders } from '../interfaces/cache.interface';
import { SigningKeyEvent } from '../interfaces/event.interface';

export const keyMock1 =
  '0x80d12670ec69b62abd4d24c828136cbb1666a63374a66269031d6101973419b66711ed712d17da05d7ca6c0b28ecd21f';
export const keys = [
  keyMock1,
  '0x81011ad6ebe5c7844e59b1799e12de769f785f66df3f63debb06149c1782d574c8c2cd9c923fa881e9dcf6d413159863',
];

export const eventsMock1 = [
  {
    key: '0x80d12670ec69b62abd4d24c828136cbb1666a63374a66269031d6101973419b66711ed712d17da05d7ca6c0b28ecd21f',
    operatorIndex: 1,
    moduleAddress: '0x11a93807078f8BB880c1BD0ee4C387537de4b4b6',
    logIndex: 1,
    blockNumber: 1591260,
    blockHash: '0x1',
  },
  {
    key: '0x80d12670ec69b62abd4d24c828136cbb1666a63374a66269031d6101973419b66711ed712d17da05d7ca6c0b28ecd21f',
    operatorIndex: 2,
    moduleAddress: '0x11a93807078f8BB880c1BD0ee4C387537de4b4b6',
    logIndex: 2,
    blockNumber: 1591260,
    blockHash: '0x1',
  },
  {
    key: '0x80d12670ec69b62abd4d24c828136cbb1666a63374a66269031d6101973419b66711ed712d17da05d7ca6c0b28ecd21f',
    operatorIndex: 1,
    moduleAddress: '0x11a93807078f8BB880c1BD0ee4C387537de4b4b6',
    logIndex: 2,
    blockNumber: 1591261,
    blockHash: '0x2',
  },
];

export const eventsMock = [
  ...eventsMock1,
  {
    key: '0x81011ad6ebe5c7844e59b1799e12de769f785f66df3f63debb06149c1782d574c8c2cd9c923fa881e9dcf6d413159863',
    operatorIndex: 1,
    moduleAddress: '0x11a93807078f8BB880c1BD0ee4C387537de4b4b6',
    logIndex: 1,
    blockNumber: 1591261,
    blockHash: '0x2',
  },
];

export const headersMock: SigningKeyEventsCacheHeaders = {
  stakingModulesAddresses: ['0x11a93807078f8BB880c1BD0ee4C387537de4b4b6'],
  startBlock: 1591259,
  endBlock: 1593259,
};

export const cacheMock: {
  data: SigningKeyEvent[];
  headers: SigningKeyEventsCacheHeaders;
} = {
  data: eventsMock,
  headers: headersMock,
};

export const newEvent = {
  key: '0x81011ad6ebe5c7844e59b1799e12de769f785f66df3f63debb06149c1782d574c8c2cd9c923fa881e9dcf6d413159863',
  operatorIndex: 1,
  moduleAddress: '0x77b13807078f8BB880c1BD0ee4C387537de4b4b6',
  logIndex: 1,
  blockNumber: 1593261,
  blockHash: '0x3',
};
