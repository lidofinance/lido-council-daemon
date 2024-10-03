import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as dotenv from 'dotenv';
import { network } from 'hardhat';

dotenv.config();

export async function impersonateAccount(account) {
  await network.provider.send('hardhat_impersonateAccount', [account]);
}

export class HardhatFork {
  private forkUrl: string;
  private port: string;
  private blockNumber: number;
  public process?: ChildProcessWithoutNullStreams;

  constructor(
    forkUrl: string,
    blockNumber: number,
    port = '8545', // Default port for Hardhat node
  ) {
    this.forkUrl = forkUrl;
    this.port = port;
    this.blockNumber = blockNumber;
  }

  public start() {
    const forkCommand = `--fork ${this.forkUrl} --fork-block-number ${this.blockNumber}`;

    this.process = spawn(
      `npx`,
      ['hardhat', 'node', '--port', this.port, ...forkCommand.split(' ')],
      {
        stdio: 'pipe', // or 'inherit' to show output in console
      },
    );

    // console.log(`Hardhat node started on port ${this.port}...`);
  }

  public stop(): void {
    if (this.process) {
      this.process.kill();
      console.log('Hardhat node stopped.');
    }
  }
}

export async function waitForServerStdout(
  stream: NodeJS.ReadableStream,
): Promise<boolean> {
  return new Promise((resolve) => {
    stream.on('data', (data: any) => {
      const output = data.toString();
      if (output.includes('Started HTTP and WebSocket JSON-RPC server at')) {
        console.log('Condition met: Hardhat node started');
        resolve(true);
      }
    });

    stream.on('error', (err: any) => {
      console.error('Error reading stream:', err);
      resolve(false);
    });

    stream.on('end', () => {
      resolve(false);
    });
  });
}
