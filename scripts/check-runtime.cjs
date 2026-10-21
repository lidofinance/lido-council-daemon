const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const blst = require('@chainsafe/blst');
const { Level } = require('level');
const { NestFactory } = require('@nestjs/core');
const {
  KeyValidatorModule,
  KeyValidatorInterface,
  KeyValidatorExecutorInterface,
  bufferFromHexString,
} = require('@lido-nestjs/key-validation');
const { validKeys } = require('../dist/guardian/keys-validation/keys.fixtures');

async function main() {
  assert.equal(process.version, 'v24.22.1');
  if (process.argv.includes('--production')) {
    for (const name of ['jest', 'typescript', 'hardhat', 'dockerode']) {
      assert.throws(() => require.resolve(name), { code: 'MODULE_NOT_FOUND' });
    }
  }

  const secret = blst.SecretKey.fromKeygen(Buffer.alloc(32, 1));
  const message = Buffer.from('runtime check');
  assert.equal(
    blst.verify(message, secret.toPublicKey(), secret.sign(message)),
    true,
  );

  const directory = await mkdtemp(join(tmpdir(), 'council-runtime-'));
  const db = new Level(join(directory, 'db'));
  try {
    await db.put('check', 'ok');
    assert.equal(await db.get('check'), 'ok');
    assert.equal(await db.get('missing'), undefined);
  } finally {
    await db.close();
    await rm(directory, { recursive: true });
  }

  const app = await NestFactory.createApplicationContext(
    KeyValidatorModule.forFeature({ multithreaded: true }),
    { logger: false },
  );
  const executor = app.get(KeyValidatorExecutorInterface);
  try {
    const validator = app.get(KeyValidatorInterface);
    const key = {
      ...validKeys[0],
      withdrawalCredentials: bufferFromHexString(
        '0x010000000000000000000000dc62f9e8c34be08501cdef4ebde0a280f576d762',
      ),
      genesisForkVersion: Buffer.from('00001020', 'hex'),
    };
    const invalid = { ...key, withdrawalCredentials: Buffer.alloc(32) };
    const results = await validator.validateKeys([key, invalid]);
    assert.deepEqual(
      results.map(([, valid]) => valid),
      [true, false],
    );
  } finally {
    await executor.destroy();
    await app.close();
  }

  console.log(
    JSON.stringify({
      node: process.version,
      architecture: process.arch,
      blst: 'passed',
      level: 'passed',
      keyValidationWorkers: 'passed',
    }),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
