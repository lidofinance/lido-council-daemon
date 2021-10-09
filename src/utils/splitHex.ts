export const splitHex = (hexString: string, chunkSize: number) => {
  if (hexString.substr(0, 2) !== '0x') {
    throw new Error('string is not a hex value');
  }

  const hexData = hexString.substr(2);
  const chunkAmount = Math.ceil(hexData.length / chunkSize);

  return new Array(chunkAmount).fill(null).map((_value, index) => {
    return hexData.substr(index * chunkSize, chunkSize);
  });
};
