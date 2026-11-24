import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { assertVersionFitsBytes32, readBuildInfo } from './app.constants';

describe('build info', () => {
  const dir = mkdtempSync(join(tmpdir(), 'council-build-info-'));

  it('reads version, branch and commit from the file', () => {
    const path = join(dir, 'present.json');
    writeFileSync(
      path,
      JSON.stringify({ version: '4.2.0', branch: 'main', commit: 'abc1234' }),
    );

    expect(readBuildInfo(path)).toEqual({
      version: '4.2.0',
      branch: 'main',
      commit: 'abc1234',
    });
  });

  it('fails when the file is missing', () => {
    const path = join(dir, 'missing.json');

    expect(() => readBuildInfo(path)).toThrow(
      `Cannot read build info from ${path}`,
    );
  });

  it('fails when a field is missing', () => {
    const path = join(dir, 'no-commit.json');
    writeFileSync(path, JSON.stringify({ version: '4.2.0', branch: 'main' }));

    expect(() => readBuildInfo(path)).toThrow('has no commit');
  });

  it('accepts a version of 31 bytes', () => {
    expect(() => assertVersionFitsBytes32('v'.repeat(31))).not.toThrow();
  });

  it('rejects a version of 32 bytes', () => {
    expect(() => assertVersionFitsBytes32('v'.repeat(32))).toThrow(
      'is longer than 31 bytes',
    );
  });
});
