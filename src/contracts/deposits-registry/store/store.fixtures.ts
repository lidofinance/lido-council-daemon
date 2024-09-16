import {
  VerifiedDepositEvent,
  VerifiedDepositEventsCacheHeaders,
} from '../interfaces';

// Mock for VerifiedDepositEventsCacheHeaders
export const headersMock: VerifiedDepositEventsCacheHeaders = {
  startBlock: 1000,
  endBlock: 1050,
};

// Mock for VerifiedDepositEvent
export const eventMock1: VerifiedDepositEvent = {
  pubkey: 'abc123',
  wc: '0',
  amount: '100',
  signature: 'def456',
  tx: 'ghi789',
  blockNumber: 1001,
  blockHash: 'aaa111',
  logIndex: 1,
  index: '0',
  depositCount: 1,
  depositDataRoot: new Uint8Array([1, 2, 3, 4, 5]),
  valid: true,
};

export const eventMock2: VerifiedDepositEvent = {
  pubkey: 'xyz123',
  wc: '0',
  amount: '200',
  signature: 'uvw456',
  tx: 'rst789',
  blockNumber: 1002,
  blockHash: 'bbb222',
  logIndex: 2,
  index: '1',
  depositCount: 2,
  depositDataRoot: new Uint8Array([6, 7, 8, 9, 10]),
  valid: true,
};

// Mock for the structure {data: VerifiedDepositEvent[], headers: VerifiedDepositEventsCacheHeaders}
export const cacheMock: {
  data: VerifiedDepositEvent[];
  headers: VerifiedDepositEventsCacheHeaders;
} = {
  data: [eventMock1, eventMock2],
  headers: headersMock,
};
