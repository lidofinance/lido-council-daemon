export function decimalToHexBytes(number, bytes) {
  // Convert the number to hexadecimal
  let hexRepresentation = number.toString(16);

  // Pad the hexadecimal representation with leading zeros if necessary
  hexRepresentation = hexRepresentation.padStart(bytes * 2, '0');

  return hexRepresentation;
}

export function packNodeOperatorIds(nodeOperatorIds) {
  let hexString = '';
  for (const id of nodeOperatorIds) {
    hexString += decimalToHexBytes(id, 8);
  }
  return `0x${hexString}`;
}

export function packVettedSigningKeysCounts(vettedSigningKeysCounts) {
  let hexString = '';
  for (const count of vettedSigningKeysCounts) {
    hexString += decimalToHexBytes(count, 16);
  }
  return `0x${hexString}`;
}

export function hexBytesToDecimal(hexString: string): number {
  // Remove the '0x' prefix if it exists
  if (hexString.startsWith('0x')) {
    hexString = hexString.slice(2);
  }

  // Convert the hexadecimal string to decimal
  return parseInt(hexString, 16);
}

export function unpackNodeOperatorIds(packedHex: string): number[] {
  const nodeOperatorIds: number[] = [];
  // Remove the '0x' prefix if it exists
  if (packedHex.startsWith('0x')) {
    packedHex = packedHex.slice(2);
  }

  // Iterate over the packed hexadecimal string in chunks of 16 characters (8 bytes)
  for (let i = 0; i < packedHex.length; i += 16) {
    const hexId = packedHex.substr(i, 16); // Get the next 16 characters
    const decimalId = hexBytesToDecimal(hexId); // Convert the hexadecimal to decimal
    nodeOperatorIds.push(decimalId); // Add the decimal ID to the array
  }

  return nodeOperatorIds;
}
