const changeEndianness = (string: any) => {
  string = string.replace('0x', '');
  const result: string[] = [];
  let len = string.length - 2;
  while (len >= 0) {
    result.push(string.substr(len, 2));
    len -= 2;
  }
  return '0x' + result.join('');
};

export const parseLittleEndian64 = (str: string) => {
  return parseInt(changeEndianness(str), 16);
};

export const toLittleEndian64 = (value: number): string => {
  const buffer = Buffer.allocUnsafe(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return '0x' + buffer.toString('hex');
};
