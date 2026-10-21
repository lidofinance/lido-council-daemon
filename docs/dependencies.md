# Dependency maintenance

Use Node.js 24.22.1 and Yarn 1.22.22. Keep direct dependencies and security
resolutions at exact versions. Commit the generated `yarn.lock` with each
dependency change. CI and Docker use `--frozen-lockfile`.

## Compatibility

The application uses Nest 11 and Express 5. TypeScript 5.9 matches the Nest
CLI's pinned compiler. TypeScript 7 is outside the lint and test tools' declared
peer ranges. Jest 30 uses ts-jest 29.4. Nest 11, SSZ 0.18 and Hardhat 2 retain
the current CommonJS toolchain. Newer Nest and SSZ distributions use ESM;
Hardhat 3 also changes its config and CLI APIs. Ethers stays on 5.8 because the
Lido execution modules and generated contracts use its API. SSZ 0.18 matches
the key-validation worker. BLST 2.2 is the published version for these workers.

The latest `@lido-nestjs/*` packages still declare Nest 8 and reflect-metadata
0.1 peers. Yarn reports these mismatches. The packages use public Nest APIs.
Keep the real Nest HTTP/health/metrics/scheduler/provider probe and the BLS
worker tests when changing these versions. These checks cover this application's
usage; they do not change the packages' published support policy.

At startup, the existing HTTP and HTTPS agents have `keepAlive` disabled.
This avoids ethers v5 stale socket failures while preserving Node's proxy
configuration, timeouts and TLS settings.

Level 10 returns `undefined` for a missing key. The stores handle that value
explicitly. Invalid JSON and database errors still fail the operation.
Prometheus uses `@prometheus-io/client`, the successor to `prom-client`.

## Security resolutions

Checked against the npm advisory service on 2026-10-21. The parent packages
still request older versions. Keep overrides scoped to those parents.

| Parent | Dependency | Version | Reason |
| --- | --- | --- | --- |
| Lido key-validation | piscina | 4.9.4 | Fix prototype-pollution worker options |
| ethers providers | ws | 8.22.0 | Fix memory disclosure and resource exhaustion |
| Hardhat | undici | 6.29.1 | Fix HTTP security issues and remove vulnerable busboy |
| Hardhat | uuid | 11.1.1 | Fix buffer bounds handling |
| Hardhat | adm-zip | 0.6.1 | Fix archive extraction and decompression issues |
| solc | tmp | 0.2.7 | Fix temporary path handling |
| Mocha | diff | 8.0.4 | Fix patch parsing resource exhaustion |
| Mocha | serialize-javascript | 7.1.2 | Fix generated JavaScript handling |
| Sentry | cookie | 0.7.2 | Validate cookie fields |
| Istanbul load-nyc-config | js-yaml | 4.3.2 | Remove unpatched sprintf-js through argparse 2 |

Istanbul calls `load`, which is present in js-yaml 4. Hardhat uses the retained
Undici client APIs and UUID `v4`. These overrides cross some parent version
ranges. Run the build, typecheck, lint, unit tests and fork tests after changes.

## Remaining advisory

The full npm audit on 2026-10-21 still reports
[GHSA-848j-6mx2-7j84](https://github.com/advisories/GHSA-848j-6mx2-7j84)
for elliptic 6.6.1. No patched release is published. This is a low-severity
package finding, not a clean audit result.

The reported nonce truncation issue concerns curves such as P-521. The daemon
uses ethers' `SigningKey`, which fixes the curve to secp256k1 and requires a
32-byte digest. Generated nonce candidates fit 32 bytes, so the reported
truncation branch does not apply. DSM messages and transactions are hashed
before signing. The wallet tests check malformed digest rejection, deterministic
signatures for a digest with leading zeroes, and signer recovery. This bounds
the reported issue in this application; it does not fix elliptic generally.

Run `yarn audit` to see all current findings. Do not hide this advisory or lower
the audit threshold to describe the dependency tree as vulnerability-free.

## Runtime checks

```bash
yarn install --frozen-lockfile --non-interactive
yarn build
yarn typecheck
yarn lint
yarn test --runInBand
yarn audit
docker build --platform linux/arm64 -t council-node24:arm64 .
docker build --platform linux/amd64 -t council-node24:amd64 .
docker run --rm --network none --platform linux/arm64 council-node24:arm64 node scripts/check-runtime.cjs --production
docker run --rm --network none --platform linux/amd64 council-node24:amd64 node scripts/check-runtime.cjs --production
```

Check BLST signing/verification, BLS workers and Level put/get inside both final
images. Run fork e2e tests with the prerequisites in the README. Check TLS
connectivity to the deployment's RPC and message brokers before rollout.
Keep Node's default TLS verification and key-exchange settings enabled.
