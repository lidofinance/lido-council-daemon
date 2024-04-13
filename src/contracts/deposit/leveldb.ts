import { Level } from 'level';
import { VerifiedDepositEvent, VerifiedDepositEventsCacheHeaders } from '.';

export interface DepositEvent {
  pubkey: string;
  wc: string;
  amount: string;
  signature: string;
  tx: string;
  blockNumber: number;
  blockHash: string;
  logIndex: number;
  index: string;
  depositCount: number;
  depositEventHash: Uint8Array;
}
// level.Level

const db = new Level('cache/leveldb-mainnet', { valueEncoding: 'json' });
const depositsDB = db.sublevel('deposits', { valueEncoding: 'json' });
const headersDB = db.sublevel('headers', { valueEncoding: 'json' });

async function putDepositEvent(
  depositEvent: VerifiedDepositEvent,
): Promise<void> {
  const { depositEventHash, ...rest } = depositEvent;
  const value = {
    ...rest,
    depositEventHash: Array.from(depositEventHash), // Сериализация Uint8Array
  };
  const key = generateDepositKey(value.depositCount);
  await db.put(key, JSON.stringify(value));
}

function serializeDepositEvent(depositEvent: VerifiedDepositEvent) {
  const { depositEventHash, ...rest } = depositEvent;
  const value = {
    ...rest,
    depositEventHash: Array.from(depositEventHash), // Сериализация Uint8Array
  };
  return JSON.stringify(value);
}

async function getDepositEvent(key: number): Promise<DepositEvent> {
  const strKey = generateDepositKey(key);
  const data = JSON.parse(await db.get(strKey));
  const depositEvent: DepositEvent = {
    ...data,
    depositEventHash: new Uint8Array(data.depositEventHash), // Десериализация в Uint8Array
  };
  return depositEvent;
}

function parseDepositEvent(dataString: string): VerifiedDepositEvent {
  const data = JSON.parse(dataString);
  const depositEvent: VerifiedDepositEvent = {
    ...data,
    depositEventHash: new Uint8Array(data.depositEventHash), // Десериализация в Uint8Array
  };
  return depositEvent;
}

function generateDepositKey(number: number): string {
  if (number < 0 || number > 4294967296) {
    throw new Error('Number is out of the valid range (0 to 4294967295)');
  }

  const index = Buffer.alloc(4);

  index.writeUInt32BE(number, 0);

  return `deposit:${index.toString('hex')}`;
}
export const DEPOSIT_CACHE_DEFAULT = Object.freeze({
  headers: {
    version: '-1',
    startBlock: 0,
    endBlock: 0,
  },
  data: [],
});
export async function getCache() {
  try {
    const stream = depositsDB.iterator();

    const data: VerifiedDepositEvent[] = [];

    for await (const [, value] of stream) {
      data.push(parseDepositEvent(value));
    }
    const headers: VerifiedDepositEventsCacheHeaders = JSON.parse(
      await headersDB.get('header'),
    );
    console.log(data.length, '72327');
    console.log(headers);
    return { data, headers };
    // LEVEL_NOT_FOUND
  } catch (error) {
    console.log(error);
    return DEPOSIT_CACHE_DEFAULT;
  }
}

export const putMany = async (
  events: VerifiedDepositEvent[],
  header: VerifiedDepositEventsCacheHeaders,
) => {
  const ops = events.map((event) => ({
    type: 'put' as const,
    key: generateDepositKey(event.depositCount),
    value: serializeDepositEvent(event),
    sublevel: depositsDB,
  }));
  ops.push({
    type: 'put',
    key: 'header',
    value: JSON.stringify(header),
    sublevel: headersDB,
  });
  await db.batch(ops);
  // const { data } = await getCache();
  // console.log(data.length, events.length, data.length === events.length);
};
