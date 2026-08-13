import { spawn, ChildProcessWithoutNullStreams } from 'child_process';

const HARDHAT_CLI_PATH = require.resolve('hardhat/internal/cli/bootstrap');
const DEFAULT_START_TIMEOUT_MS = 60_000;

export class HardhatServer {
  private hardhatProcess: ChildProcessWithoutNullStreams | null = null;
  private ready = false;

  // Method to start Hardhat and wait until it's ready
  public async start(timeoutMs = DEFAULT_START_TIMEOUT_MS) {
    return new Promise<void>((resolve, reject) => {
      this.hardhatProcess = spawn(
        process.execPath,
        [HARDHAT_CLI_PATH, 'node', '--hostname', '0.0.0.0'],
        {
          env: { ...process.env },
        },
      );

      if (!this.hardhatProcess) {
        return reject(new Error('Failed to start Hardhat process'));
      }

      // Log the PID of the started process
      console.log(
        `Hardhat process started with PID: ${this.hardhatProcess.pid}`,
      );

      const timeout = setTimeout(() => {
        const processId = this.hardhatProcess?.pid;
        this.hardhatProcess?.kill('SIGTERM');
        reject(
          new Error(
            `Hardhat process ${
              processId ?? 'unknown'
            } stayed alive but did not become ready within ${timeoutMs} ms; startup or fork initialization is stuck`,
          ),
        );
      }, timeoutMs);

      // Listen for stdout to detect when Hardhat is ready
      this.hardhatProcess.stdout.on('data', (data) => {
        const output = data.toString();
        // Check for the Hardhat ready message
        if (output.includes('Started HTTP and WebSocket JSON-RPC server')) {
          clearTimeout(timeout);
          this.ready = true;
          resolve();
        }
      });

      // Listen for errors
      this.hardhatProcess.stderr.on('data', (data) => {
        console.error(`Hardhat stderr: ${data}`);
      });

      this.hardhatProcess.on('error', (error) => {
        clearTimeout(timeout);
        console.error(`Failed to start Hardhat: ${error}`);
        reject(error);
      });

      this.hardhatProcess.on('close', (code) => {
        if (!this.ready) {
          clearTimeout(timeout);
          reject(
            new Error(
              `Hardhat process exited before readiness with code ${code}`,
            ),
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
