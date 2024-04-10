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
