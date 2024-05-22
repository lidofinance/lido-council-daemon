import { ethers } from 'ethers';

function padHex(value: number, bytes: number): string {
  return ethers.utils.hexZeroPad(ethers.utils.hexlify(value), bytes);
}

export function packIds(ids: number[], bytes: number): string {
  return '0x' + ids.map((id) => padHex(id, bytes).slice(2)).join('');
}

export function decimalToHexBytes(number: number, bytes: number): string {
  return padHex(number, bytes).slice(2);
}

export function packNodeOperatorIds(nodeOperatorIds: number[]): string {
  return packIds(nodeOperatorIds, 8);
}

export function packVettedSigningKeysCounts(
  vettedSigningKeysCounts: number[],
): string {
  return packIds(vettedSigningKeysCounts, 16);
}

export function hexBytesToDecimal(hexString: string): number {
  hexString = hexString.startsWith('0x') ? hexString : `0x${hexString}`;
  return ethers.BigNumber.from(hexString).toNumber();
}

export function unpackNodeOperatorIds(packedHex: string): number[] {
  const nodeOperatorIds: number[] = [];
  const hexString = packedHex.startsWith('0x') ? packedHex.slice(2) : packedHex;

  for (let i = 0; i < hexString.length; i += 16) {
    const hexId = hexString.substr(i, 16);
    const decimalId = hexBytesToDecimal(hexId);
    nodeOperatorIds.push(decimalId);
  }

  return nodeOperatorIds;
}
