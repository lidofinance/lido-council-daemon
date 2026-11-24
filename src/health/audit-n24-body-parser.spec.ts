// Audit candidate N24-HTTP-1 (Node 24 dependency update).
// Nest 11 / Express 5 brought body-parser 2.3.0, listed in
// GHSA-27r3-jxmh-p828: trailing bytes after a compressed request body can end
// the process. The lockfile now holds 2.4.0. The daemon's HTTP port runs the
// default body parser before routing. This test sends the advisory's payload
// shape in ten variants and asserts that the process stays up. The same
// result was observed with 2.3.0, so the test guards the behavior and does
// not prove the advisory either way.
import { ChildProcess, spawn } from 'node:child_process';
import http = require('node:http');
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { brotliCompressSync, deflateSync, gzipSync } from 'node:zlib';

const root = join(__dirname, '..', '..');

type Running = { child: ChildProcess; port: number; stderr: () => string };

async function startHttpLayer(): Promise<Running> {
  const child = spawn(
    process.execPath,
    [
      '-r',
      'ts-node/register',
      '-r',
      'tsconfig-paths/register',
      join(root, 'test/fixtures/audit-n24-http-app.ts'),
    ],
    {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        TS_NODE_TRANSPILE_ONLY: 'true',
        NODE_ENV: 'test',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let stdout = '';
  let stderr = '';
  child.stderr?.on('data', (chunk) => (stderr += chunk));
  const port = await new Promise<number>((resolve, reject) => {
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
      const match = stdout.match(/AUDIT_HTTP_PORT=(\d+)/);
      if (match) resolve(Number(match[1]));
    });
    child.once('exit', (code) =>
      reject(new Error(`fixture exited early with ${code}: ${stderr}`)),
    );
  });
  return { child, port, stderr: () => stderr };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

// Sends the parts as separate writes, so trailing bytes can arrive after the
// decoder has finished the first frame.
function post(
  port: number,
  encoding: string,
  parts: Buffer[],
  pauseMs: number,
): Promise<number | string | undefined> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: '/audit-missing',
        method: 'POST',
        agent: false,
        headers: {
          'Content-Type': 'application/json',
          'Content-Encoding': encoding,
          'Content-Length': parts.reduce((sum, part) => sum + part.length, 0),
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      },
    );
    req.on('error', (error: NodeJS.ErrnoException) => resolve(error.code));
    (async () => {
      for (const [index, part] of parts.entries()) {
        if (index > 0 && pauseMs) await sleep(pauseMs);
        req.write(part);
      }
      req.end();
    })();
  });
}

const junk = Buffer.from('trailing bytes');
const big = randomBytes(200 * 1024);
const fakeGzipHeader = Buffer.from([0x1f, 0x8b, 0x08, 0xff, 1, 2, 3, 4, 5, 6]);
const variants: [string, string, Buffer[], number][] = [
  ['gzip, junk in the same write', 'gzip', [gzipSync('{}'), junk], 0],
  ['gzip, junk in a later write', 'gzip', [gzipSync('{}'), junk], 300],
  ['gzip, broken second member', 'gzip', [gzipSync('{}'), fakeGzipHeader], 300],
  ['gzip, 600 KB of junk', 'gzip', [gzipSync('{}'), big, big, big], 300],
  ['deflate, junk in the same write', 'deflate', [deflateSync('{}'), junk], 0],
  ['deflate, junk in a later write', 'deflate', [deflateSync('{}'), junk], 300],
  [
    'deflate, 600 KB of junk',
    'deflate',
    [deflateSync('{}'), big, big, big],
    300,
  ],
  [
    'deflate, second valid frame',
    'deflate',
    [deflateSync('{}'), deflateSync('{}')],
    300,
  ],
  [
    'brotli, junk in a later write',
    'br',
    [brotliCompressSync('{}'), junk],
    300,
  ],
  [
    'brotli, 600 KB of junk',
    'br',
    [brotliCompressSync('{}'), big, big, big],
    300,
  ],
];

describe('audit N24-HTTP-1: compressed request body on the health port', () => {
  let running: Running | undefined;

  afterEach(() => {
    running?.child.kill('SIGKILL');
    running = undefined;
  });

  it('control: serves health and metrics, rejects an unknown POST', async () => {
    running = await startHttpLayer();
    const { port, child } = running;

    expect(await get(port, '/health')).toBe(200);
    expect(await get(port, '/metrics')).toBe(200);
    expect(await post(port, 'gzip', [gzipSync('{}')], 0)).toBe(404);
    await sleep(300);
    expect(child.exitCode).toBeNull();
  }, 60_000);

  it.each(variants)(
    'observed: the process survives %s',
    async (_name, encoding, parts, pauseMs) => {
      running = await startHttpLayer();
      const { port, child, stderr } = running;

      const status = await post(port, encoding, parts, pauseMs);
      await sleep(1000);

      expect([400, 404]).toContain(status);
      expect(child.exitCode).toBeNull();
      expect(stderr()).toBe('');
      expect(await get(port, '/health')).toBe(200);
    },
    60_000,
  );
});
