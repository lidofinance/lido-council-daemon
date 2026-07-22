import { spawn, ChildProcessWithoutNullStreams } from 'child_process';

const HARDHAT_CLI_PATH = require.resolve('hardhat/internal/cli/bootstrap');

export class HardhatServer {
  private hardhatProcess: ChildProcessWithoutNullStreams | null = null;
  private ready = false;

  // Method to start Hardhat and wait until it's ready
  public async start() {
    return new Promise<void>((resolve, reject) => {
      this.hardhatProcess = spawn(process.execPath, [
        HARDHAT_CLI_PATH,
        'node',
        '--hostname',
        '0.0.0.0',
      ]);

      if (!this.hardhatProcess) {
        return reject(new Error('Failed to start Hardhat process'));
      }

      // Log the PID of the started process
      console.log(
        `Hardhat process started with PID: ${this.hardhatProcess.pid}`,
      );

      // Listen for stdout to detect when Hardhat is ready
      this.hardhatProcess.stdout.on('data', (data) => {
        const output = data.toString();
        // Check for the Hardhat ready message
        if (output.includes('Started HTTP and WebSocket JSON-RPC server')) {
          this.ready = true;
          resolve();
        }
      });

      // Listen for errors
      this.hardhatProcess.stderr.on('data', (data) => {
        console.error(`Hardhat stderr: ${data}`);
      });

      this.hardhatProcess.on('error', (error) => {
        console.error(`Failed to start Hardhat: ${error}`);
        reject(error);
      });

      this.hardhatProcess.on('close', (code) => {
        if (code !== 0 && !this.ready) {
          reject(
            new Error(`Hardhat process exited unexpectedly with code ${code}`),
          );
        }
      });
    });
  }

  public async stop() {
    if (!this.hardhatProcess) {
      console.log('No Hardhat process to stop.');
      return;
    }

    const hardhatProcess = this.hardhatProcess;
    await new Promise<void>((resolve) => {
      if (
        hardhatProcess.exitCode !== null ||
        hardhatProcess.signalCode !== null
      ) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        hardhatProcess.kill('SIGKILL');
      }, 2_000);

      hardhatProcess.once('close', () => {
        clearTimeout(timeout);
        resolve();
      });
      hardhatProcess.kill('SIGTERM');
    });

    this.hardhatProcess = null;
    this.ready = false;
  }
}
