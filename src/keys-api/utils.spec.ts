import { formModuleAddressFilter } from './utils'; // Replace with your actual module path

describe('formModuleAddressFilter', () => {
  test('should return an empty string for an empty array', () => {
    expect(formModuleAddressFilter([])).toBe('');
  });

  test('should handle a single address correctly', () => {
    const addresses = ['0x123'];
    expect(formModuleAddressFilter(addresses)).toBe('moduleAddress=0x123');
  });

  test('should handle multiple addresses correctly', () => {
    const addresses = ['0x123', '0x456'];
    expect(formModuleAddressFilter(addresses)).toBe(
      'moduleAddress=0x123&moduleAddress=0x456',
    );
  });

  test('should encode addresses properly', () => {
    const addresses = ['0x123', '0x&456'];
    const encodedSecondAddress = encodeURIComponent('0x&456');
    expect(formModuleAddressFilter(addresses)).toBe(
      `moduleAddress=0x123&moduleAddress=${encodedSecondAddress}`,
    );
  });
});
