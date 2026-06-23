import { buildModuleWc } from './withdrawal-credentials';

describe('buildModuleWc', () => {
  // real Lido base WC shape: 0x + type byte (01) + 31 bytes account
  const baseWC =
    '0x010000000000000000000000dc62f9e8c34be08501cdef4ebde0a280f576d762';
  // same account, but type byte replaced with 02
  const wc02 =
    '0x020000000000000000000000dc62f9e8c34be08501cdef4ebde0a280f576d762';

  it('returns the base WC unchanged for a 0x01 (curated) module', () => {
    expect(buildModuleWc(1, baseWC)).toBe(baseWC);
  });

  it('replaces the first byte with 0x02 for a CMv2 module', () => {
    expect(buildModuleWc(2, baseWC)).toBe(wc02);
  });

  it('changes only the type byte, never the account part', () => {
    expect(buildModuleWc(1, baseWC).slice(4)).toBe(
      buildModuleWc(2, baseWC).slice(4),
    );
  });
});
