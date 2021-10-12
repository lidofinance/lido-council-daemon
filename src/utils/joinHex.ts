import { strip0x } from './strip0x';

export const joinHex = (...items: string[]): string => {
  return '0x' + items.map((item) => strip0x(item)).join('');
};
