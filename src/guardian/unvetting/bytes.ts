import { utils } from 'ethers';

export function padAndJoinHex(numbers: number[], bytes: number): string {
  const paddedHexArray = numbers.map((num) => padHex(num, bytes).slice(2));
  return '0x' + paddedHexArray.join('');
}

export function padHex(decimal: number, bytes: number) {
  return utils.hexZeroPad(utils.hexlify(decimal), bytes);
}

export function packVettedSigningKeysCounts(vettedSigningKeysCounts: number[]) {
  return padAndJoinHex(vettedSigningKeysCounts, 16);
}

export function packNodeOperatorIds(nodeOperatorIds: number[]) {
  return padAndJoinHex(nodeOperatorIds, 8);
}
