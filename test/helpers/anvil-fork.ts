import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import * as dotenv from 'dotenv';

dotenv.config();

export class AnvilFork {
  private pathToAnvil: string;
  private forkUrl: string;
  private port: string;
  private blockNumber: number;
  private process?: ChildProcessWithoutNullStreams;

  constructor(
    pathToAnvil: string,
    forkUrl: string,
    blockNumber: number,
    port = '8546',
  ) {
    this.pathToAnvil = pathToAnvil;
    this.forkUrl = forkUrl;
    this.port = port;
    this.blockNumber = blockNumber;
  }

  public start() {
    const forkBlockCommand = `--fork-block-number=${this.blockNumber}`;

    this.process = spawn(`${this.pathToAnvil}/anvil`, [
      '-f',
      this.forkUrl,
      '-p',
      this.port,
      forkBlockCommand,
      '--block-time',
      '12',
      '--auto-impersonate',
    ]);

    console.log(`Anvil started on port ${this.port}...`);
  }

  public stop(): void {
    if (this.process) {
      this.process.kill();
      console.log('Anvil stopped.');
    }
  }
}
