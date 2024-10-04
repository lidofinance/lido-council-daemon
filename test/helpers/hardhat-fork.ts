import { JsonRpcProvider } from '@ethersproject/providers';
import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as dotenv from 'dotenv';

dotenv.config();

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
        stdio: 'overlapped', // or 'inherit' to show output in console
      },
    );
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
    stream.on('data', async (data: any) => {
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
