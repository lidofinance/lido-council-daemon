// Audit candidates N24-PROC-1 and N24-PROC-2 (Node 24 dependency update).
// Starts the built dist/main against a local JSON-RPC stub and checks
// process-level behavior that unit tests do not see: startup output and
// the reaction to SIGTERM. The test asserts the OBSERVED behavior of the
// pinned tree. Set AUDIT_N24_BASELINE=true to assert the behavior of the
// tree before the update (the process ends on SIGTERM).
import { ChildProcess, spawn } from 'node:child_process';
import { once } from 'node:events';
import http = require('node:http');
import { mkdtempSync } from 'node:fs';
import { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Wallet } from 'ethers';

const root = join(__dirname, '..');
const baseline = process.env.AUDIT_N24_BASELINE === 'true';
const CHAIN_ID = 560048;

const block = {
  number: '0x10',
  hash: `0x${'11'.repeat(32)}`,
  parentHash: `0x${'22'.repeat(32)}`,
  timestamp: '0x6502b1a0',
  nonce: '0x0000000000000000',
  difficulty: '0x0',
  gasLimit: '0x1c9c380',
  gasUsed: '0x0',
  miner: `0x${'00'.repeat(20)}`,
  extraData: '0x',
  baseFeePerGas: '0x7',
  transactions: [],
};

function answer({ id, method }: { id: number; method: string }) {
  const result =
    method === 'eth_chainId'
      ? `0x${CHAIN_ID.toString(16)}`
      : method === 'net_version'
        ? String(CHAIN_ID)
        : method === 'eth_blockNumber'
          ? block.number
          : method === 'eth_getBlockByNumber'
            ? block
            : undefined;
  return result === undefined
    ? { jsonrpc: '2.0', id, error: { code: -32000, message: 'audit stub' } }
    : { jsonrpc: '2.0', id, result };
}

function get(port: number, path: string): Promise<number | undefined> {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path, agent: false }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      })
      .on('error', reject);
  });
}

async function freePort(): Promise<number> {
  const server = http.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

describe('audit N24-PROC: real process start and SIGTERM', () => {
  let rpc: http.Server;
  let child: ChildProcess | undefined;

  beforeAll(async () => {
    rpc = http.createServer((request, response) => {
      let body = '';
      request.on('data', (chunk) => (body += chunk));
      request.on('end', () => {
        const payload = JSON.parse(body);
        response.setHeader('Content-Type', 'application/json');
        response.end(
          JSON.stringify(
            Array.isArray(payload) ? payload.map(answer) : answer(payload),
          ),
        );
      });
    });
    rpc.listen(0, '127.0.0.1');
    await once(rpc, 'listening');
  });

  afterAll(async () => {
    child?.kill('SIGKILL');
    await new Promise((resolve) => rpc.close(resolve));
  });

  it('starts, reports its startup output and reacts to SIGTERM', async () => {
    const rpcUrl = `http://127.0.0.1:${(rpc.address() as AddressInfo).port}`;
    const port = await freePort();
    child = spawn(
      process.execPath,
      // The production entry point; run `yarn build` first.
      ['--max-old-space-size=8192', join(root, 'dist/main')],
      {
        // The stores resolve `cache/` from the working directory.
        cwd: mkdtempSync(join(tmpdir(), 'council-audit-')),
        env: {
          PATH: process.env.PATH,
          NODE_ENV: 'production',
          PORT: String(port),
          LOG_FORMAT: 'json',
          CHAIN_ID: String(CHAIN_ID),
          RPC_URL: rpcUrl,
          WALLET_PRIVATE_KEY: Wallet.createRandom().privateKey,
          KEYS_API_URL: 'http://127.0.0.1:9',
          PUBSUB_SERVICE: 'evm-chain',
          EVM_CHAIN_DATA_BUS_ADDRESS: `0x${'33'.repeat(20)}`,
          EVM_CHAIN_DATA_BUS_PROVIDER_URL: rpcUrl,
          EVM_CHAIN_DATA_BUS_CHAIN_ID: String(CHAIN_ID),
          LOCATOR_DEVNET_ADDRESS: `0x${'44'.repeat(20)}`,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => (stdout += chunk));
    child.stderr?.on('data', (chunk) => (stderr += chunk));
    const exited = once(child, 'exit') as Promise<[number | null, string]>;

    let healthy = false;
    for (let attempt = 0; attempt < 120 && child.exitCode === null; attempt++) {
      healthy = await get(port, '/health')
        .then((status) => status === 200)
        .catch(() => false);
      if (healthy) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!healthy) throw new Error(`no health: ${stdout}\n${stderr}`);
    expect((await get(port, '/metrics')) === 200).toBe(true);

    const nonJsonStdout = stdout
      .split('\n')
      .filter(Boolean)
      .filter((line) => {
        try {
          JSON.parse(line);
          return false;
        } catch {
          return true;
        }
      });
    // Reported in the audit record; printed for the run log.
    console.log(
      JSON.stringify({
        node: process.version,
        nonJsonStdout,
        stderr: stderr.split('\n').filter(Boolean).slice(0, 20),
      }),
    );

    child.kill('SIGTERM');
    const result = await Promise.race([
      exited,
      new Promise<'alive'>((resolve) =>
        setTimeout(() => resolve('alive'), 5000),
      ),
    ]);

    if (baseline) {
      expect(result).toEqual([null, 'SIGTERM']);
    } else {
      // Observed: the key-validation executor registers a SIGTERM listener
      // that never exits, so the default signal action is gone.
      expect(result).toBe('alive');
      expect(await get(port, '/health')).toBe(200);
    }
  }, 120_000);
});
